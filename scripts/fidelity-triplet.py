import sys,os
from PIL import Image
# usage: fidelity-triplet.py id tag [maxh] -> /tmp/tri-id-tag.png  (after | html | live)
id,tag=sys.argv[1],sys.argv[2]; mh=int(sys.argv[3]) if len(sys.argv)>3 else 2400
d=f'design-reference/comparisons/{id}'
ims=[]
for k in ['after','html','live']:
    p=f'{d}/{k}-{id}-{tag}.png'
    ims.append(Image.open(p).convert('RGB') if os.path.exists(p) else Image.new('RGB',(375,200),'white'))
ims=[i.crop((0,0,i.width,min(i.height,mh))) for i in ims]
s=0.5 if tag=='desktop' else 1
ims=[i.resize((int(i.width*s),int(i.height*s))) for i in ims]
W=sum(i.width for i in ims)+40;H=max(i.height for i in ims)
o=Image.new('RGB',(W,H),'#888');x=0
for i in ims: o.paste(i,(x,0)); x+=i.width+20
o.save(f'/tmp/tri-{id}-{tag}.png')
