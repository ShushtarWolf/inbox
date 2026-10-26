# fidelity-triplet.py id tag -> /tmp/tri-id-tag.png (BRANCH | SoT | LIVE), same rules as fidelity-pdf.py
import sys,subprocess
id,tag=sys.argv[1],sys.argv[2]
subprocess.run(['python3','scripts/fidelity-pdf.py',f'/tmp/tri-{id}-{tag}.pdf',id],check=True)
print(f'/tmp/tri-{id}-{tag}.pdf')
