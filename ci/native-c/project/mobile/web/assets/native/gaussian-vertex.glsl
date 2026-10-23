#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
#ifdef GS_PROJECT_ONCE
const vec2 aCorner=vec2(0.0);
out vec3 gClip;
out vec2 gAxisX;
out vec2 gAxisY;
#else
layout(location=0) in vec2 aCorner;
#endif
uniform usampler2D uOrder;
uniform sampler2D uCenter;
uniform sampler2D uScale;
uniform sampler2D uQuat;
uniform sampler2D uDc;
uniform sampler2D uRest;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uView;
uniform vec3 uEye;
uniform vec2 uFocal;
uniform float uNear;
uniform bool uPerspective;
uniform sampler2D uFlags;
uniform vec3 uTarget;
uniform vec2 uPan;
uniform vec2 uViewport;
uniform float uBaseHeight;
uniform float uZoom;
uniform float uScaleMul;
uniform float uCutoff;
uniform int uWidth;
uniform int uRestWidth;
uniform int uDegree;
uniform bool uPointPreview;
uniform float uFar;
out vec4 vColor;
out vec2 vPos;
float gsRadius=3.0;
// SH coefficients are packed four per texel. Fetch each texel once per channel.
vec4 gsBands(int id, int channel, int group) {
  int texel=id*12+channel*4+group;
  return texelFetch(uRest,ivec2(texel&2047,texel>>11),0);
}
vec3 gsShade(vec3 dc, int id, vec3 direction) {
  vec3 color=0.28209479177387814*dc;
  if(uDegree>0){
    float x=direction.x,y=direction.y,z=direction.z;
    float xx=x*x,yy=y*y,zz=z*z,xy=x*y,yz=y*z,xz=x*z;
    vec4 b0=vec4(-0.4886025119029199*y,0.4886025119029199*z,-0.4886025119029199*x,uDegree>1?1.0925484305920792*xy:0.0);
    vec4 b1=vec4(0.0),b2=vec4(0.0),b3=vec4(0.0);
    if(uDegree>1)b1=vec4(-1.0925484305920792*yz,0.31539156525252005*(2.0*zz-xx-yy),-1.0925484305920792*xz,0.5462742152960396*(xx-yy));
    if(uDegree>2){b2=vec4(-0.5900435899266435*y*(3.0*xx-yy),2.890611442640554*xy*z,-0.4570457994644658*y*(4.0*zz-xx-yy),0.3731763325901154*z*(2.0*zz-3.0*xx-3.0*yy));
    b3=vec4(-0.4570457994644658*x*(4.0*zz-xx-yy),1.445305721320277*z*(xx-yy),-0.5900435899266435*x*(xx-3.0*yy),0.0);}
    for(int c=0;c<3;c++){
      color[c]+=dot(gsBands(id,c,0),b0);
      if(uDegree>1)color[c]+=dot(gsBands(id,c,1),b1);
      if(uDegree>2)color[c]+=dot(gsBands(id,c,2),b2)+dot(gsBands(id,c,3),b3);
    }
  }
  return clamp(color+vec3(0.5),0.0,1.0);
}

void projectGaussian() {
#ifdef GS_PROJECT_ONCE
  gAxisX=vec2(0.0);gAxisY=vec2(0.0);
  int instance=gl_VertexID;
#else
  int instance=gl_InstanceID;
#endif
  ivec2 orderUv = ivec2(instance & 2047, instance >> 11);
  int id = int(texelFetch(uOrder, orderUv, 0).r);
  ivec2 uv = ivec2(id & 2047, id >> 11);
  vec4 centerA = texelFetch(uCenter, uv, 0);
  vec3 center = centerA.xyz;
  float opacity = centerA.w;
  if(uFar>0.0)opacity*=clamp((uFar-length(center-uEye))/(uFar*.1),0.0,1.0);
  vPos = aCorner * 3.0;
  int flags = 0;
  float depth = -dot(center - uEye, -uView);
  if (opacity < 1.0/255.0 || opacity < uCutoff || (flags & 6) != 0 || (uPerspective && depth <= uNear)) { vColor = vec4(0.0); gl_Position = vec4(2.0, 2.0, 0.0, 1.0); return; }
  if (uPointPreview) {
    vec3 rel = center - uEye;
    float h = uBaseHeight / uZoom;
    vec2 clip = vec2((dot(center-uTarget,uRight)-uPan.x)/(h*uViewport.x/uViewport.y), (dot(center-uTarget,uUp)-uPan.y)/h)*2.0;
    if(uPerspective) clip=vec2(dot(rel,uRight),dot(rel,uUp))/depth*uFocal*2.0/uViewport;
    gl_Position=vec4(clip+aCorner*4.0/uViewport,0.0,1.0);
    vec3 rgb=clamp(texelFetch(uDc,uv,0).xyz*0.28209479177387814+0.5,0.0,1.0);
    vColor=vec4(rgb*opacity,opacity);vPos=aCorner;return;
  }
  // Outside this support every original fragment already fails alpha >= 1/255.
  // A small guard avoids removing threshold pixels through float rounding.

  vec4 shapeA=texelFetch(uScale,uv,0);
  vec3 shapeB=texelFetch(uQuat,uv,0).xyz;
  gsRadius=shapeB.z;
  if(uFar>0.0)gsRadius=min(3.0,sqrt(max(0.0,2.0*log(opacity*255.0)))+0.02);
  vPos=aCorner*gsRadius;
  mat3 covariance=mat3(shapeA.x,shapeA.y,shapeA.z,shapeA.y,shapeA.w,shapeB.x,shapeA.z,shapeB.x,shapeB.y)*(uScaleMul*uScaleMul);
  float worldHeight = uBaseHeight / uZoom;
  float worldWidth = worldHeight * uViewport.x / max(uViewport.y, 1.0);
  float pixelsPerWorld = uViewport.y / worldHeight;
  vec3 relative = center - uEye;
  float vx = dot(relative, uRight), vy = dot(relative, uUp);
  // Bound the off-screen Jacobian: perspective linearization diverges near
  // the eye plane. This changes projection stability, never source scales.
  vec2 slopeLimit = 0.65 * uViewport / uFocal;
  vec2 slope = clamp(vec2(vx, vy) / max(depth, uNear), -slopeLimit, slopeLimit);
  vec3 jx = uPerspective ? uFocal.x / depth * (uRight + slope.x * (-uView)) : uRight * pixelsPerWorld;
  vec3 jy = uPerspective ? uFocal.y / depth * (uUp + slope.y * (-uView)) : uUp * pixelsPerWorld;
  float cov00=dot(jx,covariance*jx)+0.3;
  vec3 covarianceY=covariance*jy;
  float cov11=dot(jy,covarianceY)+0.3;
  float cov01=dot(jx,covarianceY);
  float cx = dot(uTarget, uRight) + uPan.x;
  float cy = dot(uTarget, uUp) + uPan.y;
  vec2 clip = vec2((dot(center, uRight) - cx) / worldWidth, (dot(center, uUp) - cy) / worldHeight) * 2.0;
  if (uPerspective) clip = vec2(vx, vy) / depth * uFocal * 2.0 / uViewport;
  // Cauchy-Schwarz bounds both original rotated-quad axes by sqrt(2*variance).
  bool outsideCenter=any(greaterThan(abs(clip),vec2(1.0)));
  if(outsideCenter){
    vec2 conservative=gsRadius*sqrt(2.0*max(vec2(cov00,cov11),vec2(0.0)))*2.0/uViewport;
    if(any(greaterThan(abs(clip)-conservative,vec2(1.0)))){vColor=vec4(0.0);gl_Position=vec4(2.0,2.0,0.0,1.0);return;}
  }
  float mid = 0.5 * (cov00 + cov11);
  float disc = sqrt(max(0.0, mid * mid - (cov00 * cov11 - cov01 * cov01)));
  float lambda1 = mid + disc;
  float lambda2 = max(mid - disc, 1e-4);
  vec2 eigen = abs(cov01) < 1e-4 ? (cov00 >= cov11 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) : normalize(vec2(cov01, lambda1 - cov00));
  vec2 ortho = vec2(-eigen.y, eigen.x);
  vec2 axisX=eigen*(gsRadius*sqrt(lambda1))*2.0/uViewport;
  vec2 axisY=ortho*(gsRadius*sqrt(lambda2))*2.0/uViewport;
  vec2 offset=aCorner.x*axisX+aCorner.y*axisY;

  // Cull only when the entire original quad lies beyond the viewport.
  // Center-only culling would incorrectly remove wide edge-overlapping splats.
  vec2 support=abs(axisX)+abs(axisY);
  if(outsideCenter&&any(greaterThan(abs(clip)-support,vec2(1.0)))){vColor=vec4(0.0);gl_Position=vec4(2.0,2.0,0.0,1.0);return;}
#ifdef GS_PROJECT_ONCE
  gAxisX=axisX;gAxisY=axisY;
#endif
  clip += offset;
  gl_Position = vec4(clip, 0.0, 1.0);
  vec3 rgb = gsShade(texelFetch(uDc, uv, 0).xyz, id, uPerspective ? normalize(center - uEye) : uView);
  if ((flags & 1) != 0) rgb = mix(rgb, vec3(1.0, 0.55, 0.08), 0.65);
  vColor = vec4(rgb * opacity, opacity);
}
void main(){projectGaussian();
#ifdef GS_PROJECT_ONCE
  gClip=vec3(gl_Position.xy,gsRadius);
#endif
}
