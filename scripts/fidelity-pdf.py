# fidelity-pdf.py out.pdf id[,id...]  — 3-column (BRANCH | SoT HTML | LIVE) PDF
# - columns top-aligned, same width, white page; NO gray filler between/under columns
# - a missing column is a labelled red-outlined box with the reason from /tmp/fidelity-shots.log,
#   never a white placeholder image
# - tall shots are split across pages (same y-range for all three columns)
import sys,os
from PIL import Image,ImageDraw,ImageFont
out=sys.argv[1]; ids=sys.argv[2].split(',')
CW,GAP,HEAD,CH=560,24,70,1500
F=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
FB=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
reasons={}
if os.path.exists('/tmp/fidelity-shots.log'):
    for l in open('/tmp/fidelity-shots.log'):
        p=l.rstrip('\n').split('\t')
        if len(p)>=5 and p[0]!='ok': reasons[(p[1],p[2],p[3])]=p[0]+': '+p[4]; reasons.setdefault((p[1],'*','*'),None)
        if len(p)>=5 and p[2]=='*': reasons[(p[1],'*','*')]=p[0]+': '+p[4]
KINDS=[('after','BRANCH grok/html-fidelity'),('html','SoT HTML (layout ref)'),('live','LIVE inboxs.ir')]
pages=[];index=[]
for id in ids:
    d=f'design-reference/comparisons/{id}'
    tags=['375'] if id.startswith('m-') else ['desktop','375']
    for tag in tags:
        ims=[]
        for k,_ in KINDS:
            p=f'{d}/{k}-{id}-{tag}.png'
            if os.path.exists(p):
                im=Image.open(p).convert('RGB'); s=CW/im.width; ims.append(im.resize((CW,int(im.height*s))))
            else:
                r=reasons.get((id,k,tag)) or reasons.get((id,'*','*')) or ('NO-SOT: SoT has no 375 layout for this screen' if k=='html' and tag=='375' else 'not captured')
                ims.append(r)
        H=max([i.height for i in ims if not isinstance(i,str)] or [200])
        n=max(1,-(-H//CH))
        for part in range(n):
            pg=Image.new('RGB',(3*CW+4*GAP,HEAD+CH+GAP),'white'); dr=ImageDraw.Draw(pg)
            dr.text((GAP,8),f'{id}  ·  {tag}  ·  part {part+1}/{n}',font=FB,fill='black')
            bottom=HEAD
            for c,((k,lab),im) in enumerate(zip(KINDS,ims)):
                x=GAP+c*(CW+GAP); dr.text((x,40),lab,font=F,fill='#333')
                if isinstance(im,str):
                    if part==0:
                        dr.rectangle((x,HEAD,x+CW,HEAD+160),outline='#c41e1e',width=3)
                        dr.text((x+14,HEAD+14),'MISSING',font=FB,fill='#c41e1e')
                        y=HEAD+50
                        for i in range(0,len(im),48): dr.text((x+14,y),im[i:i+48],font=F,fill='#c41e1e'); y+=24
                        bottom=max(bottom,HEAD+160)
                    continue
                if part*CH<im.height:
                    seg=im.crop((0,part*CH,CW,min(im.height,(part+1)*CH)))
                    pg.paste(seg,(x,HEAD)); dr.rectangle((x-1,HEAD-1,x+CW,HEAD+seg.height),outline='#bbb'); bottom=max(bottom,HEAD+seg.height)
                else:
                    dr.text((x+8,HEAD+8),'(end of page — shot is shorter)',font=F,fill='#888')
            pages.append(pg.crop((0,0,pg.width,max(bottom,HEAD+200)+GAP)))
pages[0].save(out,save_all=True,append_images=pages[1:],resolution=110)
print(out,len(pages),'pages')
