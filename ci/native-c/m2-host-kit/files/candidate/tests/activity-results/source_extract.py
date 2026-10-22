"""Extract unchanged Java implementations with lexical comment/string shielding."""
from dataclasses import dataclass
import re

@dataclass(frozen=True)
class Fragment:
    text: str
    start: int
    end: int

def code_mask(text):
    out=list(text); n=len(text); i=0
    while i<n:
        first=i
        if text.startswith('//',i):
            j=text.find('\n',i+2);i=n if j<0 else j
        elif text.startswith('/*',i):
            j=text.find('*/',i+2)
            if j<0: raise ValueError('Unterminated block comment')
            i=j+2
        elif text.startswith('"""',i):
            i+=3
            while i<n and not text.startswith('"""',i): i+=2 if text[i]=='\\' else 1
            if i>=n: raise ValueError('Unterminated text block')
            i+=3
        elif text[i] in "\"'":
            quote=text[i];i+=1
            while i<n and text[i]!=quote: i+=2 if text[i]=='\\' else 1
            if i>=n: raise ValueError('Unterminated literal')
            i+=1
        else: i+=1;continue
        for j in range(first,min(i,n)):
            if out[j] not in '\r\n':out[j]=' '
    return ''.join(out)

def balanced(mask,start,left,right):
    depth=0
    if mask[start]!=left:raise ValueError('Missing opening delimiter')
    for i in range(start,len(mask)):
        if mask[i]==left:depth+=1
        elif mask[i]==right:
            depth-=1
            if not depth:return i+1
    raise ValueError('Missing closing delimiter')

def method(source,signature):
    mask=code_mask(source)
    pattern=r'\b'+r'\s+'.join(map(re.escape,signature.split()))
    matches=list(re.finditer(pattern,mask))
    if len(matches)!=1:raise ValueError(f'Expected unique {signature!r}; got {len(matches)}')
    start=matches[0].start();paren=mask.index('(',start);after=balanced(mask,paren,'(',')');opening=mask.index('{',after)
    if ';' in mask[after:opening]:raise ValueError('Declaration has no body')
    end=balanced(mask,opening,'{','}')
    return Fragment(source[start:end],start,end)

def field(source,prefix):
    mask=code_mask(source);matches=list(re.finditer(re.escape(prefix),mask))
    if len(matches)!=1:raise ValueError(f'Expected unique field {prefix!r}')
    start=matches[0].start();end=mask.index(';',start)+1
    return Fragment(source[start:end],start,end)
