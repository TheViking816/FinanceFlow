import csv, datetime, re
from pathlib import Path
user_id='ffd171f6-3a66-4e29-b98c-2c3a80642c2d'
ibkr_path=Path(r'C:\\Users\\adria\\Downloads\\Posiciones_abiertas.csv')
degiro_path=Path(r'C:\\Users\\adria\\Downloads\\Portfolio.csv')

def parse_number_eu(val):
    if val is None:
        return 0.0
    s=str(val).strip().replace(' ', '')
    if not s:
        return 0.0
    if ',' in s:
        s=s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except:
        return 0.0

market_map={
    'BM':'BME','AEB':'AMS','SBF':'EPA','LSE':'LON','NYSE':'NYSE','NASDAQ':'NASDAQ','ARCA':'NYSEARCA','NYSEARCA':'NYSEARCA','SEHK':'HKG'
}

def norm_market(m):
    m=(m or '').strip().upper()
    return market_map.get(m, m)

def norm_ticker(t, market):
    t=(t or '').strip().upper()
    if market=='HKG' and re.fullmatch(r'\d+', t or ''):
        return t.zfill(4)
    return t

isin_map={}
rows=[]
if ibkr_path.exists():
    with ibkr_path.open(encoding='utf-8') as f:
        reader=csv.DictReader(f)
        for r in reader:
            asset=(r.get('AssetClass') or '').lower()
            desc=(r.get('Description') or '').lower()
            symbol=(r.get('Symbol') or '').strip()
            isin=(r.get('ISIN') or '').strip().upper()
            if ('cash' in asset or 'cash' in desc) or (not symbol and not isin):
                continue
            market=norm_market(r.get('ListingExchange'))
            currency=(r.get('CurrencyPrimary') or '').strip().upper()
            qty=parse_number_eu(r.get('Quantity'))
            price=parse_number_eu(r.get('MarkPrice'))
            avg=parse_number_eu(r.get('CostBasisPrice'))
            report=r.get('ReportDate') or ''
            price_date=None
            if re.fullmatch(r'\d{8}', report):
                price_date=f"{report[0:4]}-{report[4:6]}-{report[6:8]}"
            name=(r.get('Description') or '').strip()
            if isin:
                isin_map[isin]={'symbol':symbol or isin,'market':market,'currency':currency}
            ticker=norm_ticker(symbol or isin, market)
            rows.append({
                'ticker':ticker,
                'market':market,
                'currency':currency,
                'qty':qty,
                'avg_price':avg if avg else price,
                'price':price,
                'price_date':price_date or datetime.date.today().isoformat(),
                'name':name,
            })

if degiro_path.exists():
    with degiro_path.open(encoding='utf-8') as f:
        reader=csv.DictReader(f)
        for r in reader:
            name=(r.get('Producto') or '').strip()
            isin=(r.get('Symbol/ISIN') or '').strip().upper()
            if name.upper().startswith('CASH') or not isin:
                continue
            qty=parse_number_eu(r.get('Cantidad'))
            price=parse_number_eu(r.get('Precio de'))
            value_local=r.get('Valor local') or ''
            m=re.search(r'[A-Z]{3}', value_local)
            currency=(m.group(0) if m else 'EUR').upper()
            mapped=isin_map.get(isin)
            symbol=isin
            market=''
            if mapped:
                symbol=mapped['symbol']
                market=mapped['market']
                currency=mapped['currency'] or currency
            ticker=norm_ticker(symbol, market)
            rows.append({
                'ticker':ticker,
                'market':market,
                'currency':currency,
                'qty':qty,
                'avg_price':price,
                'price':price,
                'price_date':datetime.date.today().isoformat(),
                'name':name,
            })

agg={}
for r in rows:
    key=(r['ticker'], r['market'], r['currency'])
    entry=agg.get(key, {'qty':0.0,'avg_price':0.0,'price':0.0,'price_date':r['price_date'],'name':r['name']})
    qty=r['qty'] or 0.0
    entry['qty']+=qty
    if qty>0:
        entry['avg_price']=((entry['avg_price']*(entry['qty']-qty)) + r['avg_price']*qty)/entry['qty']
    if r['price']:
        entry['price']=r['price']
        entry['price_date']=r['price_date']
    entry['name']=entry['name'] or r['name']
    agg[key]=entry

vals=[]
for (ticker, market, currency), v in agg.items():
    name=v['name'].replace("'","''") if v['name'] else ''
    vals.append((ticker, market or '', currency or 'EUR', v['qty'], v['avg_price'], v['price'], v['price_date'], name))

values_lines=[]
for i, (t,m,c,q,avg_p,p,dt,name) in enumerate(vals):
    line=f"  ({t!r}, {m!r}, {c!r}, {q:.6f}, {avg_p:.6f}, {p:.6f}, {dt!r}, {name!r})"
    if i < len(vals)-1:
        line+=','
    values_lines.append(line)

cte = "WITH src(ticker, market, currency, quantity, avg_price, price, price_date, name) AS (\n  VALUES\n" + "\n".join(values_lines) + "\n)"

sql_lines=[]
sql_lines.append('BEGIN;')
sql_lines.append(cte)
sql_lines.append("UPDATE holdings h SET quantity = src.quantity, avg_price = src.avg_price, currency = src.currency, name = COALESCE(h.name, NULLIF(src.name, '')) FROM src WHERE h.user_id = '%s' AND upper(h.ticker)=src.ticker AND upper(COALESCE(h.market,''))=COALESCE(src.market,'');" % user_id)
sql_lines.append(cte)
sql_lines.append("INSERT INTO holdings (user_id, broker_id, ticker, name, market, currency, quantity, avg_price, fees_total)")
sql_lines.append("SELECT '%s', NULL, src.ticker, NULLIF(src.name,''), src.market, src.currency, src.quantity, src.avg_price, 0" % user_id)
sql_lines.append("FROM src WHERE NOT EXISTS (SELECT 1 FROM holdings h WHERE h.user_id='%s' AND upper(h.ticker)=src.ticker AND upper(COALESCE(h.market,''))=COALESCE(src.market,''));" % user_id)
sql_lines.append(cte)
sql_lines.append('INSERT INTO security_prices (ticker, market, currency, price_date, close_price)')
sql_lines.append('SELECT src.ticker, src.market, src.currency, src.price_date, src.price FROM src')
sql_lines.append('ON CONFLICT (ticker, market, price_date) DO UPDATE SET close_price = EXCLUDED.close_price, currency = EXCLUDED.currency;')
sql_lines.append('COMMIT;')

out_path=Path('scripts')
out_path.mkdir(exist_ok=True)
file=out_path/'import-brokers.sql'
file.write_text('\n'.join(sql_lines), encoding='utf-8')
print(str(file))
