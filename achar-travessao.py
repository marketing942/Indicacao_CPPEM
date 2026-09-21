"""Lista os travessões que aparecem para o visitante.

Ignora <style>, <script> e comentários HTML: ali o travessão é comentário de
código, que é para dev e não para o público.
"""
import io
import re
import sys

sys.stdout.reconfigure(encoding="utf-8")

ARQUIVOS = [
    r"C:/Projetos/cppem/Sites CPPEM/indicaçõesCPPEM/index.html",
    r"C:/Projetos/cppem/Sites CPPEM/indicaçõesCOLEGIO/index.html",
    r"C:/Projetos/cppem/Sites CPPEM/indicaçõesUNICIVE/index.html",
    r"C:/Projetos/cppem/Sites CPPEM/indicaçõesCPPEM/script.js",
    r"C:/Projetos/cppem/Sites CPPEM/indicaçõesUNICIVE/script.js",
    r"C:/Projetos/cppem/Sites CPPEM/indicaçõesCOLEGIO/script.js",
]


def limpar(texto, ehjs):
    if ehjs:
        # no script só interessa o que está entre aspas (texto que vira tela)
        fora = re.sub(r"/\*[\s\S]*?\*/", "", texto)
        fora = re.sub(r"(?m)^\s*//.*$", "", fora)
        return fora
    sem = re.sub(r"<style[\s\S]*?</style>", "", texto)
    sem = re.sub(r"<script[\s\S]*?</script>", "", sem)
    sem = re.sub(r"<!--[\s\S]*?-->", "", sem)
    return sem


total = 0
for caminho in ARQUIVOS:
    bruto = io.open(caminho, encoding="utf-8").read()
    visivel = limpar(bruto, caminho.endswith(".js"))

    achados = []
    for m in re.finditer("—", visivel):
        ini = max(0, m.start() - 70)
        achados.append(visivel[ini:m.start() + 70].replace("\n", " ").strip())

    nome = "/".join(caminho.split("/")[-2:])
    print("\n### %s  (%d)" % (nome, len(achados)))
    for a in achados:
        print("   ...%s..." % re.sub(r"\s+", " ", a))
    total += len(achados)

print("\nTOTAL VISÍVEL AO PÚBLICO: %d" % total)
