# Cinema Script — extension Premiere Pro

Panneau CEP pour Adobe Premiere Pro (`com.kino.derushage`).

## Contenu

| Fichier | Rôle |
|---|---|
| `CSXS/manifest.xml` | Déclaration de l'extension (obligatoire) |
| `index.html` | Interface du panneau + logique Node.js |
| `jsx/host.jsx` | Script ExtendScript exécuté dans Premiere |
| `analyze.py` | Analyse audio (détection du bip) |
| `CSInterface.js` | Bibliothèque Adobe CEP |
| `package.json` | Dépendances Node (`ffmpeg-static`) |
| `requirements.txt` | Dépendances Python (`numpy`, `scipy`) |

`node_modules/` et `logs/` ne sont pas versionnés.

## Installation

Prérequis : Node.js et Python 3 installés.

1. Copier ce dossier dans le dossier des extensions CEP, sous le nom `cinema_script` :
   - Windows : `%APPDATA%\Adobe\CEP\extensions\cinema_script`
   - Mac : `~/Library/Application Support/Adobe/CEP/extensions/cinema_script`
2. Dans ce dossier :
   ```
   npm install
   pip install -r requirements.txt
   ```
3. Autoriser les extensions non signées (PlayerDebugMode) — le numéro CSXS dépend de la version de Premiere, activer 10 à 12 ne coûte rien :
   - Windows :
     ```
     reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f
     ```
   - Mac :
     ```
     defaults write com.adobe.CSXS.12 PlayerDebugMode 1
     ```
4. Relancer Premiere Pro → menu **Fenêtre > Extensions > Cinema Script**.
