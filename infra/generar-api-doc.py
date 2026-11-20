#!/usr/bin/env python3
"""Genera la tabla completa de rutas de docs/API.md leyendo los controladores de apps/api/src.
Uso (desde la raíz del repo):  python3 infra/generar-api-doc.py
Reemplaza lo que hay entre los marcadores <!-- rutas:inicio --> y <!-- rutas:fin -->."""
import glob, re, pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ROL = {'CAJERO': 'C', 'REGENTE': 'R', 'ADMIN': 'A'}


def roles(txt):
    m = re.search(r"@Roles\(([^)]*)\)", txt)
    return ', '.join(ROL[r] for r in re.findall(r"'(\w+)'", m.group(1))) if m else None


filas = []
for f in sorted(glob.glob(str(RAIZ / 'apps/api/src/**/*.ts'), recursive=True)):
    src = open(f, encoding='utf-8').read()
    for bloque in re.split(r"(?=@Controller\()", src)[1:]:
        base = re.match(r"@Controller\('([^']*)'\)", bloque)
        if not base:
            continue
        cabecera = bloque[:bloque.find('{')]
        rol_clase = roles(cabecera) or 'Todos'
        cuerpo = bloque[bloque.find('{'):]
        for m in re.finditer(r"((?:\s*/\*\*[\s\S]*?\*/)?(?:\s*@\w+\([^)]*\))*)\s*@(Get|Post|Patch|Put|Delete)\(('([^']*)')?\)((?:\s*@\w+\([^)]*\))*)", cuerpo):
            decor = m.group(1) + m.group(5)
            doc = re.search(r"/\*\*([\s\S]*?)\*/", m.group(1))
            texto = ' '.join(l.strip(' *') for l in doc.group(1).splitlines()).strip() if doc else ''
            publico = '@Publico' in decor
            quien = 'Público' if publico else (roles(decor) or rol_clase)
            ruta = '/' + '/'.join(p for p in [base.group(1), m.group(4) or ''] if p)
            filas.append((ruta, m.group(2).upper(), quien, texto))

tabla = ['| Método | Ruta | Quién | Qué hace |', '|---|---|---|---|']
tabla += [f"| {met} | `{ruta}` | {quien} | {texto.replace('|', '/')} |" for ruta, met, quien, texto in sorted(filas)]
bloque = '<!-- rutas:inicio -->\n## Todas las rutas\n\nGenerada del código con `python3 infra/generar-api-doc.py`. ' \
         f'{len(filas)} rutas.\n\n' + '\n'.join(tabla) + '\n<!-- rutas:fin -->'
doc = (RAIZ / 'docs/API.md').read_text(encoding='utf-8')
if '<!-- rutas:inicio -->' in doc:
    doc = re.sub(r"<!-- rutas:inicio -->[\s\S]*<!-- rutas:fin -->", lambda _: bloque, doc)
else:
    doc = doc.rstrip() + '\n\n' + bloque + '\n'
(RAIZ / 'docs/API.md').write_text(doc, encoding='utf-8')
print(f'{len(filas)} rutas escritas en docs/API.md')
