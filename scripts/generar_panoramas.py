"""Genera ideas de panoramas baratos para pareja en Santiago y las deja en data/panoramas.json.
Lo ejecuta GitHub Actions cada lunes. Requiere el secret ANTHROPIC_API_KEY."""
import datetime, json, os, pathlib, re, sys
import requests

API_KEY = os.environ.get("ANTHROPIC_API_KEY")
MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
SALIDA = pathlib.Path(__file__).resolve().parent.parent / "data" / "panoramas.json"

PROMPT = """Eres un asistente que propone panoramas para una pareja joven que vive en Santiago de Chile.
Presupuesto: cada salida debe costar entre $0 y $20.000 pesos chilenos en total para los dos.
Incluye variedad: al aire libre, cultura gratuita, comida barata, planes en casa y algo de temporada
según la fecha de hoy ({hoy}, hemisferio sur). Evita repetir estas ideas anteriores: {previas}.

Responde SOLO con un arreglo JSON (sin texto adicional ni bloques de código) de 12 objetos con:
- "titulo": máximo 6 palabras
- "descripcion": una frase concreta de máximo 20 palabras
- "costo_aprox": entero en pesos chilenos para los dos (0 si es gratis)
- "momento": "tardecita", "fin de semana" o "cualquiera"
"""


def main():
    if not API_KEY:
        sys.exit("Falta ANTHROPIC_API_KEY")
    previas = []
    if SALIDA.exists():
        previas = [i["titulo"] for i in json.loads(SALIDA.read_text("utf-8")).get("ideas", [])]
    hoy = datetime.date.today().isoformat()
    r = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={"x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={"model": MODEL, "max_tokens": 2000,
              "messages": [{"role": "user", "content": PROMPT.format(hoy=hoy, previas=", ".join(previas) or "ninguna")}]},
        timeout=90,
    )
    if r.status_code != 200:
        sys.exit(f"Error {r.status_code} de la API: {r.text}")
    texto = "".join(b.get("text", "") for b in r.json()["content"])
    texto = re.sub(r"```(json)?", "", texto).strip()
    ideas = json.loads(texto)
    limpias = []
    for i in ideas:
        momento = i.get("momento") if i.get("momento") in ("tardecita", "fin de semana", "cualquiera") else "cualquiera"
        limpias.append({"titulo": str(i["titulo"])[:60], "descripcion": str(i.get("descripcion", ""))[:160],
                        "costo_aprox": max(0, int(i.get("costo_aprox") or 0)), "momento": momento})
    if not limpias:
        sys.exit("La respuesta no trajo ideas")
    SALIDA.write_text(json.dumps({"generado": hoy, "ideas": limpias}, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"{len(limpias)} ideas escritas en {SALIDA}")


if __name__ == "__main__":
    main()