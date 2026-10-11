/** Symmetric R diag(scale²) Rᵀ, packed as xx, xy, xz, yy, yz, zz. */
export function gsCovariance(sx,sy,sz,w,x,y,z) {
  const a=1-2*(y*y+z*z), b=2*(x*y-w*z), c=2*(x*z+w*y);
  const d=2*(x*y+w*z), e=1-2*(x*x+z*z), f=2*(y*z-w*x);
  const g=2*(x*z-w*y), h=2*(y*z+w*x), i=1-2*(x*x+y*y);
  sx*=sx;sy*=sy;sz*=sz;
  return [a*a*sx+b*b*sy+c*c*sz,a*d*sx+b*e*sy+c*f*sz,a*g*sx+b*h*sy+c*i*sz,d*d*sx+e*e*sy+f*f*sz,d*g*sx+e*h*sy+f*i*sz,g*g*sx+h*h*sy+i*i*sz];
}
