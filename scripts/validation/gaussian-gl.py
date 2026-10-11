#!/usr/bin/env python3
"""Optional Linux Mesa/GLES regression: pass baseline and candidate renderer.js paths.
Runs offscreen without a browser. This checks shader pixels, not WebView performance.
Use system Python so a Conda libstdc++ cannot shadow the Mesa driver's dependency.
"""
import ctypes as C
import math
import os
from pathlib import Path
import random
import re
import sys
import json
os.environ.setdefault('__EGL_VENDOR_LIBRARY_FILENAMES','/usr/share/glvnd/egl_vendor.d/50_mesa.json')
os.environ.setdefault('EGL_PLATFORM','surfaceless')
os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE','1')
e=C.CDLL('libEGL.so.1');g=C.CDLL('libGLESv2.so.2')
def fn(lib,name,ret,*args):
    f=getattr(lib,name);f.restype=ret;f.argtypes=list(args);return f
I=C.c_int;U=C.c_uint;F=C.c_float;P=C.c_void_p
getproc=fn(e,'eglGetProcAddress',P,C.c_char_p)
platform=C.CFUNCTYPE(P,U,P,P)(getproc(b'eglGetPlatformDisplayEXT'))
d=platform(0x31DD,None,None)
assert fn(e,'eglInitialize',U,P,P,P)(d,None,None)
attrs=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038)
config=P();number=I()
assert fn(e,'eglChooseConfig',U,P,P,P,I,P)(d,attrs,C.byref(config),1,C.byref(number)) and number.value
surf=fn(e,'eglCreatePbufferSurface',P,P,P,P)(d,config,(I*5)(0x3057,192,0x3056,192,0x3038))
ctx=fn(e,'eglCreateContext',P,P,P,P,P)(d,config,None,(I*3)(0x3098,3,0x3038))
assert fn(e,'eglMakeCurrent',U,P,P,P,P)(d,surf,surf,ctx)
createShader=fn(g,'glCreateShader',U,U);shaderSource=fn(g,'glShaderSource',None,U,I,P,P)
compileShader=fn(g,'glCompileShader',None,U);shaderiv=fn(g,'glGetShaderiv',None,U,U,P)
getLog=fn(g,'glGetShaderInfoLog',None,U,I,P,P)
createProgram=fn(g,'glCreateProgram',U);attach=fn(g,'glAttachShader',None,U,U)
link=fn(g,'glLinkProgram',None,U);programiv=fn(g,'glGetProgramiv',None,U,U,P)
use=fn(g,'glUseProgram',None,U);loc=fn(g,'glGetUniformLocation',I,U,C.c_char_p)
u1i=fn(g,'glUniform1i',None,I,I);u1f=fn(g,'glUniform1f',None,I,F)
u2f=fn(g,'glUniform2f',None,I,F,F);u3f=fn(g,'glUniform3f',None,I,F,F,F)
genTex=fn(g,'glGenTextures',None,I,P);active=fn(g,'glActiveTexture',None,U)
bindTex=fn(g,'glBindTexture',None,U,U);param=fn(g,'glTexParameteri',None,U,U,I)
texImage=fn(g,'glTexImage2D',None,U,I,I,I,I,I,U,U,P)
genBuffer=fn(g,'glGenBuffers',None,I,P);bindBuffer=fn(g,'glBindBuffer',None,U,U)
bufferData=fn(g,'glBufferData',None,U,C.c_ssize_t,P,U)
enableAttr=fn(g,'glEnableVertexAttribArray',None,U);attr=fn(g,'glVertexAttribPointer',None,U,I,U,U,I,P)
draw=fn(g,'glDrawArraysInstanced',None,U,I,I,I)
clearColor=fn(g,'glClearColor',None,F,F,F,F);clear=fn(g,'glClear',None,U)
viewport=fn(g,'glViewport',None,I,I,I,I);enable=fn(g,'glEnable',None,U);disable=fn(g,'glDisable',None,U)
blend=fn(g,'glBlendFunc',None,U,U);read=fn(g,'glReadPixels',None,I,I,I,I,U,U,P)
error=fn(g,'glGetError',U);getString=fn(g,'glGetString',C.c_char_p,U)

def program(path):
    source=Path(path).read_text();p=createProgram()
    for name,kind in [('GS_VERTEX',0x8B31),('GS_FRAGMENT',0x8B30)]:
        code=re.search(r'const '+name+r' = `([\s\S]*?)`;',source)[1].encode()
        shader=createShader(kind);text=C.c_char_p(code);shaderSource(shader,1,C.byref(text),None);compileShader(shader)
        okay=I();shaderiv(shader,0x8B81,C.byref(okay))
        if not okay.value:
            log=C.create_string_buffer(32768);getLog(shader,len(log),None,log);raise RuntimeError(log.value.decode())
        attach(p,shader)
    link(p);okay=I();programiv(p,0x8B82,C.byref(okay));assert okay.value,'link failed'
    return p

N=900;W=2048;H=1
random.seed(730)
centers=[0.]*(W*H*4);scales=centers.copy();quats=centers.copy();dc=centers.copy();flags=centers.copy()
covA=centers.copy();covB=centers.copy();restH=math.ceil(N*12/W);rest=[0.]*(W*restH*4)
for i in range(N):
    b=4*i;x,y,z=[random.uniform(-1.6,1.6) for _ in range(3)]
    centers[b:b+4]=[x,y,z,random.uniform(.01,.9)]
    sc=[random.uniform(.015,.13) for _ in range(3)];scales[b:b+3]=sc
    q=[random.uniform(-1,1) for _ in range(4)];norm=math.sqrt(sum(v*v for v in q));w,x,y,z=[v/norm for v in q];quats[b:b+4]=[w,x,y,z]
    m=[[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]]
    c=lambda a,b:sum(m[a][j]*m[b][j]*sc[j]**2 for j in range(3))
    covA[b:b+4]=[c(0,0),c(0,1),c(0,2),c(1,1)];covB[b:b+2]=[c(1,2),c(2,2)]
    dc[b:b+3]=[random.uniform(-1,1) for _ in range(3)]
    flags[b]=2 if i%19==0 else 1 if i%17==0 else 0
    for channel in range(3):
        for band in range(15):rest[(i*12+channel*4+band//4)*4+band%4]=random.uniform(-.2,.2)
order=sorted(range(N),key=lambda i:centers[4*i+2])+[0]*(W-N)

def texture(unit,data,width,height,integer=False):
    texture=U();genTex(1,C.byref(texture));active(0x84C0+unit);bindTex(0x0DE1,texture.value)
    param(0x0DE1,0x2801,0x2600);param(0x0DE1,0x2800,0x2600)
    a=((U if integer else F)*len(data))(*data)
    texImage(0x0DE1,0,0x8236 if integer else 0x8814,width,height,0,0x8D94 if integer else 0x1908,0x1405 if integer else 0x1406,a)

def render(p,new,degree,perspective,scale):
    use(p)
    for n,v in [('uOrder',0),('uCenter',1),('uScale',2),('uQuat',3),('uDc',4),('uRest',5),('uFlags',6),('uWidth',W),('uRestWidth',W),('uDegree',degree),('uPointPreview',0),('uPerspective',int(perspective))]:u1i(loc(p,n.encode()),v)
    for n,v in [('uNear',.001),('uBaseHeight',4.5),('uZoom',1),('uScaleMul',scale),('uCutoff',0),('uFar',0)]:u1f(loc(p,n.encode()),v)
    for n,v in [('uRight',[1,0,0]),('uUp',[0,1,0]),('uView',[0,0,-1]),('uEye',[0,0,6]),('uTarget',[0,0,0])]:u3f(loc(p,n.encode()),*v)
    for n,v in [('uFocal',[160,160]),('uViewport',[192,192]),('uPan',[0,0])]:u2f(loc(p,n.encode()),*v)
    for unit,data,width,height,integer in [(0,order,W,H,True),(1,centers,W,H,False),(2,covA if new else scales,W,H,False),(3,covB if new else quats,W,H,False),(4,dc,W,H,False),(5,rest,W,restH,False),(6,flags,W,H,False)]:texture(unit,data,width,height,integer)
    corners=[-1,-1,1,-1,-1,1,1,1] if new else [-1,-1,1,-1,1,1,-1,-1,1,1,-1,1]
    buffer=U();genBuffer(1,C.byref(buffer));bindBuffer(0x8892,buffer.value);a=(F*len(corners))(*corners);bufferData(0x8892,C.sizeof(a),a,0x88E4);enableAttr(0);attr(0,2,0x1406,0,0,None)
    viewport(0,0,192,192);disable(0x0B71);disable(0x0B44);enable(0x0BE2);blend(1,0x0303);clearColor(0,0,0,1);clear(0x4000)
    draw(0x0005 if new else 0x0004,0,4 if new else 6,N)
    out=(C.c_ubyte*(192*192*4))();read(0,0,192,192,0x1908,0x1401,out);assert error()==0
    return out
baseline=program(sys.argv[1]);candidate=program(sys.argv[2]);results=[]
for perspective in [False,True]:
    for degree in range(4):
        for scale in [.5,1,2]:
            a=render(baseline,False,degree,perspective,scale);b=render(candidate,True,degree,perspective,scale)
            diffs=[abs(x-y) for x,y in zip(a,b)];mean=sum(diffs)/len(diffs);large=sum(v>2 for v in diffs)
            results.append(dict(perspective=perspective,degree=degree,scale=scale,meanChannelError=mean,maxChannelError=max(diffs),channelsOver2=large))
            assert mean<.15 and large/len(diffs)<.001,results[-1]
print(json.dumps(dict(renderer=getString(0x1F01).decode(),cases=results),indent=2))
