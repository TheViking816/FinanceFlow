
export interface AIAnalysisRequest {
    tier1: string[];
    tier2: string[];
    tier3: string[];
    apiKey: string;
}

export const analyzeTiers = async ({ tier1, tier2, tier3, apiKey }: AIAnalysisRequest): Promise<string> => {
    if (!apiKey) throw new Error("API Key requerida");

    const prompt = `
Eres un analista financiero experto en inversión por dividendos (estrategia DGI - Dividend Growth Investing).
Tu misión es generar un INFORME DE INVERSIÓN DETALLADO en formato Markdown.

Analiza las siguientes empresas candidatas que han destacado en nuestros screeners:
- Tier 1 (Máxima coincidencia): ${tier1.join(', ') || 'N/A'}
- Tier 2 (Alta coincidencia): ${tier2.join(', ') || 'N/A'}
- Tier 3 (Media coincidencia): ${tier3.join(', ') || 'N/A'}

### TUS INSTRUCCIONES:
1. **Selecciona TU TOP 3** absoluto de entre todas las empresas listadas. Si hay pocas empresas, analiza las que haya, pero intenta dar un ranking claro de las 3 mejores oportunidades de compra AHORA.
2. Para cada una del TOP 3, genera una ficha con:
   - **Nombre y Ticker**
   - **Puntuación Global (0-10)**: Basada en Calidad + Valoración + Seguridad.
   - **Datos Clave**: Proporciona el **Dividend Yield (Rentabilidad)** actual aprox. y el **Payout Ratio** estimado (usa tu conocimiento si no tienes el dato exacto).
   - **Análisis de Valoración**: ¿Está barata, justa o cara? (Comparativa histórica de PER o Yield).
   - **Análisis de Seguridad/Calidad**: Ventajas competitivas (Moat), deuda y seguridad del dividendo.
   - **Veredicto**: ¿Comprar, Mantener o Esperar?

3. **Menciones Honoríficas**: Si hay otras empresas interesantes fuera del Top 3, menciónalas en una línea.
4. **Advertencias ("Trampas de Valor")**: Si alguna empresa de la lista tiene un Yield muy alto pero es peligrosa, ADVÍERTELO CLARAMENTE.

Formato de salida esperado (Markdown limpio):
# 🏆 Top 3 Oportunidades DGI

## 1. [Ticker] - [Nombre]
**Puntuación: 🟢 [X]/10**
- **Yield**: X.X% | **Payout**: ~XX%
- **Análisis**: [Texto detallado sobre valoración y calidad...]
- **Veredicto**: [COMPRA FUERTE / ACUMULAR / ...]

... (repetir para 2 y 3)

## ⚠️ Advertencias y Notas
[...texto...]
`;

    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-3.5-turbo", // Use a widely available model
                messages: [
                    { role: "system", content: "Eres un analista financiero senior especializado en DGI." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7,
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || "Error en la llamada a OpenAI");
        }

        const data = await response.json();
        return data.choices[0]?.message?.content || "No se pudo generar el análisis.";
    } catch (error: any) {
        console.error("AI Error:", error);
        throw new Error(error.message || "Error de conexión con la IA");
    }
};
