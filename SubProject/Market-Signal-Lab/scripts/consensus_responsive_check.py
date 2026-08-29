#!/usr/bin/env python3
import argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--static',action='store_true');p.add_argument('--all-locales',action='store_true');p.add_argument('--viewports',default='');args=p.parse_args()
html=Path('internal/web/templates/index.html').read_text();css=Path('internal/web/assets/css/consensus.css').read_text();js=Path('internal/web/assets/js/consensus.js').read_text()
required=['id="consensus"','id="consensusMatrix"','@media(max-width:959px)','initializeConsensusWorkspace','/api/consensus/dashboard']
missing=[x for x in required if x not in html+css+js]
if missing: raise SystemExit('missing responsive consensus markers: '+', '.join(missing))
print('consensus responsive static contract: PASS')
