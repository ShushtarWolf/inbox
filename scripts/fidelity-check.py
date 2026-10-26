# fidelity-check.py file.png -> "OK w×h std=…" or "REJECT reason"
import sys
from PIL import Image, ImageStat
p=sys.argv[1]; im=Image.open(p).convert('L')
w,h=im.size
if w<300 or h<300: print(f'REJECT tiny {w}x{h}'); sys.exit()
st=ImageStat.Stat(im).stddev[0]
lo,hi=im.getextrema()
if st<6 or hi-lo<30: print(f'REJECT blank std={st:.1f}'); sys.exit()
print(f'OK {w}x{h} std={st:.1f}')
