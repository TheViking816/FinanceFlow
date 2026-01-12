import csv, re
from pathlib import Path

sheet_path=Path(r'C:\\Users\\adria\\Downloads\\Cartera DGI - Cartera (1).csv')
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

# Build ISIN -> (symbol, market)
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
            qty=parse_number_eu(r.get('Quantity'))
            if isin:
                isin_map[isin]={'symbol':symbol or isin,'market':market}
            ticker=norm_ticker(symbol or isin, market)
            rows.append({'ticker':ticker,'market':market,'qty':qty})

if degiro_path.exists():
    with degiro_path.open(encoding='utf-8') as f:
        reader=csv.DictReader(f)
        for r in reader:
            name=(r.get('Producto') or '').strip()
            isin=(r.get('Symbol/ISIN') or '').strip().upper()
            if name.upper().startswith('CASH') or not isin:
                continue
            qty=parse_number_eu(r.get('Cantidad'))
            mapped=isin_map.get(isin)
            symbol=isin
            market=''
            if mapped:
                symbol=mapped['symbol']
                market=mapped['market']
            ticker=norm_ticker(symbol, market)
            rows.append({'ticker':ticker,'market':market,'qty':qty})

# Aggregate qty by ticker+market
qty_map={}
for r in rows:
    key=(r['ticker'], r['market'])
    qty_map[key]=qty_map.get(key, 0.0)+ (r['qty'] or 0.0)

# Read current sheet
out_rows=[]
with sheet_path.open(encoding='utf-8') as f:
    reader=csv.DictReader(f)
    headers=reader.fieldnames or []
    headers_lower=[h.lower() for h in headers]
    if 'acciones' not in headers_lower:
        headers.append('acciones')
    for row in reader:
        ticker_raw=(row.get('ticker') or '').strip()
        market=''
        ticker=ticker_raw
        if ':' in ticker_raw:
            market, ticker = ticker_raw.split(':',1)
            market=market.strip().upper()
            ticker=ticker.strip().upper()
        ticker=norm_ticker(ticker, market)
        key=(ticker, market)
        qty=qty_map.get(key)
        row['acciones']= '' if qty is None else (str(int(qty)) if abs(qty-int(qty))<1e-6 else f"{qty:.6f}")
        out_rows.append(row)

out_path=Path('scripts')
out_path.mkdir(exist_ok=True)
out_file=out_path/'sheet-with-acciones.csv'
with out_file.open('w', newline='', encoding='utf-8') as f:
    writer=csv.DictWriter(f, fieldnames=headers)
    writer.writeheader()
    writer.writerows(out_rows)

print(str(out_file))
