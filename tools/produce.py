"""One-time asset authoring. Build uses only the committed outputs."""
import json, math, subprocess, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'
TMP=pathlib.Path('/tmp/facetgen'); TMP.mkdir(exist_ok=True)
def run(tool,*args):
    subprocess.run([tool,*map(str,args)],check=True,stdout=subprocess.DEVNULL,cwd=TMP)
def write(path,data):
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(data))
def line(a,p,q,c):
    a.append(dict(op='line',x0=round(p[0]),y0=round(p[1]),x1=round(q[0]),y1=round(q[1]),color=c))
def poly(a,pts,c):
    for y in range(max(0,math.ceil(min(p[1] for p in pts))), math.floor(max(p[1] for p in pts))+1):
        xs=[]
        for p,q in zip(pts,pts[1:]+pts[:1]):
            if (p[1]<=y<q[1]) or (q[1]<=y<p[1]): xs.append(p[0]+(y-p[1])*(q[0]-p[0])/(q[1]-p[1]))
        xs.sort()
        for x,z in zip(xs[::2],xs[1::2]): line(a,(math.ceil(x),y),(math.floor(z),y),c)
def shade(rgb,f): return '#'+''.join(f'{min(255,round(v*f)):02x}' for v in rgb)
names=['ruby','amber','citrine','jade','beryl','sapphire','amethyst','prism']
colors=[(239,65,108),(244,149,53),(228,208,75),(56,204,151),(54,207,224),(87,127,250),(184,111,247),(191,224,231)]
shapes=[[(32,4),(55,22),(49,46),(32,59),(10,43),(8,21)],[(18,8),(45,8),(58,31),(45,54),(18,54),(5,31)],[(32,3),(57,43),(32,58),(7,43)],[(16,8),(47,8),(55,17),(55,46),(47,55),(16,55),(8,46),(8,17)],[(32,3),(51,20),(51,43),(32,59),(13,43),(13,20)],[(32,3),(60,31),(32,59),(4,31)],[(32,4),(53,16),(59,36),(43,55),(21,55),(5,36),(11,16)],[(32,3),(55,17),(55,45),(32,59),(9,45),(9,17)]]
def stone(k,strain=0,frame=0,breaking=False):
    a=[]; pts=shapes[k]; rgb=colors[k]; center=(30,29)
    if k==7 and frame:
        angle=frame*math.pi/18
        pts=[(32+(x-32)*math.cos(angle)-(y-32)*math.sin(angle),32+(x-32)*math.sin(angle)+(y-32)*math.cos(angle)) for x,y in pts]
    for i,(p,q) in enumerate(zip(pts,pts[1:]+pts[:1])):
        dx=dy=0
        if breaking:
            dx=((p[0]+q[0])/2-32)*frame*.28; dy=((p[1]+q[1])/2-32)*frame*.28+frame*frame*.5
        move=lambda v:(v[0]+dx,v[1]+dy)
        col=shade(colors[i%7] if k==7 else rgb,[.68,1.05,.54,.8,1.18,.85,1.3, .7][(i+frame*(k==7))%8])
        poly(a,[move(p),move(q),move(center)],col)
        line(a,move(p),move(q),shade(rgb,.48))
        ip=(p[0]*.53+center[0]*.47,p[1]*.53+center[1]*.47)
        iq=(q[0]*.53+center[0]*.47,q[1]*.53+center[1]*.47)
        poly(a,[move(p),move(ip),move(iq)],shade(rgb,1.18 if i>3 else .84))
        line(a,move(ip),move(iq),shade(rgb,1.35))
    if not breaking:
        line(a,(20,17),(30,12),'#e8fcff'); line(a,(20,18),(25,16),'#ffffff')
        cracks=[[(34,8),(29,23),(36,29),(25,44),(28,52)],[(13,26),(29,23),(41,35),(50,34)],[(12,43),(25,44),(33,34),(45,50)]]
        for path in cracks[:strain]:
            for p,q in zip(path,path[1:]):
                line(a,(p[0]+1,p[1]),(q[0]+1,q[1]),'#ffe5bd' if strain==3 else '#b5e6e7')
                line(a,p,q,'#201e36')
        if strain==3:
            for p,q in zip(pts,pts[1:]+pts[:1]): line(a,p,q,'#ffd6ab')
    return a
def render(a,path,w=64,h=64,sheet=False):
    path.parent.mkdir(parents=True,exist_ok=True); log=TMP/'art.json'; write(log,a)
    run('draw-sheet' if sheet else 'draw','render','--actions',log,'--out',path,'--width',w,'--height',h,'--no-layers')
for k,name in enumerate(names):
    for strain in range(4): render(stone(k,strain),OUT/f'gems/{name}-{strain}.png')
    for f in range(6):
        render(stone(k,frame=f,breaking=k!=7),OUT/(f'gems/break/{name}/{f}.png' if k!=7 else f'gems/prism-turn/{f}.png'),sheet=True)
for name in ['brilliant','star']:
    a=[]
    if name=='brilliant':
        for r,c in [(28,'#f7e6b9'),(24,'#aa9368')]:
            pts=[(32+math.cos(i*math.pi/4)*r,32+math.sin(i*math.pi/4)*r) for i in range(8)]
            for p,q in zip(pts,pts[1:]+pts[:1]): line(a,p,q,c)
    else:
        pts=[(32+math.sin(i*math.pi/4)*(29 if i%2==0 else 9),32+math.cos(i*math.pi/4)*(29 if i%2==0 else 9)) for i in range(8)]
        for p,q in zip(pts,pts[1:]+pts[:1]): line(a,p,q,'#fff5cf')
    render(a,OUT/f'gems/{name}.png')
a=[]
def rect(x,y,w,h,c):
    a.append(dict(op='fill_rect',x=x,y=y,width=w,height=h,color=c))
# Bench surround with inset brass rails, rivets and checker wells.
rect(0,0,608,608,'#253b43'); rect(2,2,604,604,'#60727a'); rect(3,3,602,602,'#101c25'); rect(9,9,590,590,'#b59c65'); rect(10,10,588,588,'#26383d'); rect(15,15,578,578,'#09171f')
for r in range(8):
    for c in range(8):
        rect(16+c*72,16+r*72,71,71,'#14252e' if (r+c)%2==0 else '#11212a')
        line(a,(21+c*72,19+r*72),(81+c*72,19+r*72),'#20353e')
for x in [5,602]:
    for y in [5,602]: rect(x-1,y-1,3,3,'#dec493')
render(a,OUT/'gems/frame.png',608,608)
# Procedural effects authored as actual particle systems.
for name,count,speed,size in [('clear',13,72,3),('flaw',28,125,5),('cut',20,62,4),('aura',9,12,2)]:
    cfg=TMP/f'{name}.json'; write(cfg,dict(width=128,height=128,duration_ms=1200,fps=30,seed=17,actions=str(TMP/f'{name}-ops.json'),preview=str(TMP/f'{name}.gif'),system=str(OUT/f'fx/{name}.json')))
    run('particle-2d','--config',cfg,'init')
    run('particle-2d','--config',cfg,'add-emitter','--name','spark','--shape','disc','--radius',24 if name=='aura' else 4,'--x',0,'--y',0,'--rate' if name=='aura' else '--burst',count,'--lifetime',850 if name=='aura' else 480,'--speed',speed,'--speed-spread',speed/3,'--cone-angle',180)
    run('particle-2d','--config',cfg,'set-particle','--emitter','spark','--size-from',size,'--size-to',0,'--opacity-from',.8,'--opacity-to',0,'--color-gradient','#fff3cf@0,#75d7e5@0.5,#5885b0@1','--rotation',100)
    if name=='aura': run('particle-2d','--config',cfg,'set-timeline','--loop','true')
    run('particle-2d','--config',cfg,'render','--frame',8)
# Sound files: restrained bell transients with secondary harmonics.
for name,freq,dur in [('select',850,65),('swap',620,115),('refuse',110,120),('land',85,160),('flaw',2200,90),('cut',1320,400),('levelup',660,650),('gameover',330,850)]+[(f'chain-{i}',440*2**((i-1)/12*2),260) for i in range(1,9)]:
    cfg=TMP/'sound.json'; write(cfg,dict(sample_rate=22050,channels='mono',max_duration_ms=dur+180,seed=17,actions=str(TMP/'sound-ops.json'),preview=str(TMP/'sound.png'),wav=str(OUT/f'audio/{name}.wav')))
    run('sfx-synth','--config',cfg,'init')
    for n,mul,gain in [('body',1,-17),('shine',2.76,-27)]:
        run('sfx-synth','--config',cfg,'add-voice','--name',n,'--wave','noise' if name=='flaw' else 'sine','--freq',freq*mul,'--dur',dur,'--gain',gain)
        run('sfx-synth','--config',cfg,'set-envelope','--voice',n,'--env','pluck' if name!='gameover' else 'linear')
    if name=='cut' or name.startswith('chain'):
        run('sfx-synth','--config',cfg,'add-fm','--voice','shine','--modulator',1.41,'--index',.7)
        run('sfx-synth','--config',cfg,'add-reverb','--size',.25,'--mix',.12)
    if name in ['swap','levelup','gameover']:
        run('sfx-synth','--config',cfg,'set-pitch','--voice','body','--slide-to',freq*(2 if name!='gameover' else .35),'--over',dur)
    run('sfx-synth','--config',cfg,'render')
cfg=TMP/'sample.json'; write(cfg,dict(sample_rate=22050,channels='mono',max_duration_ms=600,seed=17,sample_pack='combat-core',actions=str(TMP/'sample-ops.json'),preview=str(TMP/'sample.png'),wav=str(OUT/'audio/shatter.wav')))
run('sfx-sample','--config',cfg,'init'); run('sfx-sample','--config',cfg,'add-sample','--name','debris_glass','--t',0,'--gain',-10); run('sfx-sample','--config',cfg,'render')
for name,tempo in [('title',96),('play',72)]:
    cfg=TMP/'music.json'; write(cfg,dict(sample_rate=22050,channels='stereo',max_duration_ms=round(32*60000/tempo),seed=17,instrument_bank='gm-lite',actions=str(TMP/'music-ops.json'),preview=str(TMP/'music.png'),wav=str(OUT/f'audio/{name}.wav'),mid=str(OUT/f'audio/{name}.mid')))
    run('music','--config',cfg,'init');run('music','--config',cfg,'set-tempo','--bpm',tempo)
    for track,inst in [('melody','music_box' if name=='title' else 'vibraphone'),('bass','marimba')]:
        run('music','--config',cfg,'define-track','--name',track,'--instrument',inst)
        run('music','--config',cfg,'set-track-fx','--track',track,'--gain',-8 if name=='title' else -12,'--reverb',.12)
    hook=[76,79,83,81,79,76,74,71,74,78,81,79,78,74,71,67]
    for i in range(32):
        run('music','--config',cfg,'add-note','--track','melody','--pitch',hook[i%16],'--t',i,'--dur',.7,'--velocity',65)
        if i%2==0: run('music','--config',cfg,'add-note','--track','bass','--pitch',[52,48,55,50][i//8],'--t',i,'--dur',1.7,'--velocity',55)
    run('music','--config',cfg,'render')
print('Produced all Facet assets.')
