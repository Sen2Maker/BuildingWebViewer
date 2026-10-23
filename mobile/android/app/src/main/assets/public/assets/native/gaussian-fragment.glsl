#version 300 es
precision highp float;
in vec4 vColor;
in vec2 vPos;
out vec4 fragColor;
void main() {
  float weight = exp(-0.5 * dot(vPos, vPos));
  float alpha = vColor.a * weight;
  if (alpha < 1.0 / 255.0) discard;
  fragColor = vec4(vColor.rgb * weight, alpha);
}
