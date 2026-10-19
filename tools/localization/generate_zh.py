"""Generate offline terminology from PokeAPI CSVs and reviewed UI translations.

Run from any directory. Source CSVs are cached in tools/cache; --download refreshes
them from the PokeAPI repository. No web requests occur while playing.
"""
import argparse
import csv
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'tools/cache'
SOURCE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
FILES = ['languages.csv', 'pokemon_species_names.csv', 'move_names.csv',
         'item_names.csv', 'type_names.csv', 'region_names.csv', 'moves.csv', 'items.csv']


def rows(file):
    with (CACHE / file).open(encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def names(file, id_key):
    result = {}
    for row in rows(file):
        result.setdefault(row[id_key], {})[row['local_language_id']] = row['name']
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    for file in FILES:
        if args.download or not (CACHE / file).exists():
            urllib.request.urlretrieve(SOURCE + file, CACHE / file)
    export = "let d={};global.G={I18n:{add:x=>Object.assign(d,x)}};require('./js/data/lang-en.js');process.stdout.write(JSON.stringify(d));"
    english = json.loads(subprocess.check_output(['node', '-e', export], cwd=ROOT, encoding='utf-8'))
    entries = list(english.items())
    # 12 = Simplified Chinese; 9 = English; 7 = Spanish.
    assert next(r for r in rows('languages.csv') if r['id'] == '12')['identifier'] == 'zh-hans'
    lookup = {}
    for file, key in [('item_names.csv', 'item_id'), ('move_names.csv', 'move_id'),
                      ('region_names.csv', 'region_id'), ('type_names.csv', 'type_id')]:
        for translations in names(file, key).values():
            if '9' in translations and '12' in translations:
                lookup[translations['9']] = translations['12']
    lookup['Swarm'] = '虫群'  # Custom evolved move; not the Swarm ability.
    ui = json.loads((ROOT / 'tools/localization/zh-ui.json').read_text(encoding='utf-8'))
    extras = json.loads((ROOT / 'tools/localization/zh-extra.json').read_text(encoding='utf-8'))
    for source, text in extras.items():
        ui[source] = text
        ui[source[:1].upper() + source[1:]] = text
    for es, text in ui.items():
        if es.count('{x}') != text.count('{x}'):
            raise ValueError(f'Placeholder mismatch: {es!r}')
    missing = []
    for index, (es, en) in enumerate(entries):
        if es not in ui:
            if en in lookup:
                ui[es] = lookup[en]
            else:
                missing.append((index, en))
    (CACHE / 'zh-missing.json').write_text(json.dumps(missing, ensure_ascii=False, indent=2), encoding='utf-8')
    if missing:
        print(f'{len(missing)} untranslated entries: tools/cache/zh-missing.json')
        raise SystemExit(1)
    species = names('pokemon_species_names.csv', 'pokemon_species_id')
    dex = subprocess.check_output(['node', '-e', "global.G={};require('./js/data/pokedex.js');process.stdout.write(JSON.stringify(G.DEX));"], cwd=ROOT, encoding='utf-8')
    for pokemon in json.loads(dex):
        ui[pokemon['name']] = species[str(pokemon['dex'])]['12']
    for region in names('region_names.csv', 'region_id').values():
        if '9' in region and '12' in region:
            ui[region['9']] = region['12']
    # Also translate inline English aliases in descriptions.
    for es, en in entries:
        if en in lookup and len(en) >= 4:
            ui.setdefault(en, lookup[en])
    ui['PokéSurvivor – Juego Pokémon gratis online estilo Survivor.io'] = 'PokéSurvivor · 宝可梦幸存者 · 本地汉化版'
    ui['Entendido'] = '知道了'
    ui['Normal'] = '普通'
    output = '/* 简体中文；术语来源 PokeAPI，界面译文见 tools/localization/zh-ui.json。 */\n'
    output += 'G.I18n.add(' + json.dumps(ui, ensure_ascii=False, indent=2) + ", 'zh-CN');\n"
    (ROOT / 'js/data/lang-zh-CN.js').write_text(output, encoding='utf-8')
    move_names = names('move_names.csv', 'move_id')
    identifiers = {r['identifier']: move_names[r['id']]['12'] for r in rows('moves.csv') if r['id'] in move_names and '12' in move_names[r['id']]}
    evo_names = {es: ui[es] for es in english if english[es] in lookup}
    move_output = '/* 只本地化显示名称，保留招式 ID、属性和数值。 */\nif (G.I18n.lang === \'zh-CN\') {\n'
    move_output += '  const names = ' + json.dumps(identifiers, ensure_ascii=False) + ';\n'
    move_output += '  const evolutions = ' + json.dumps(evo_names, ensure_ascii=False) + ';\n'
    move_output += "  for (const move of G.Moves.ALL) { if (names[move.id]) move.name = names[move.id]; }\n"
    move_output += "  for (const evo of Object.values(G.Moves.EVO)) { if (evolutions[evo[0]]) evo[0] = evolutions[evo[0]]; }\n}\n"
    (ROOT / 'js/data/move-names-zh-CN.js').write_text(move_output, encoding='utf-8')
    print(f'Generated {len(ui)} translations, {len(json.loads(dex))} Pokemon names, move names by ID.')


if __name__ == '__main__':
    main()
