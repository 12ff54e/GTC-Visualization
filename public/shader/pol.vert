#version 300 es
layout(location = 0) in vec3 grid_pt;

uniform vec2 center;
uniform vec2 dim;
uniform vec2 z_range;
uniform vec2 resolution;

out float val;

void main() {
    vec2 rel = resolution / dim;
    vec2 pos = (grid_pt.xy - center) * 2.f * min(rel.x, rel.y) / resolution;

    val = 2.f * (grid_pt.z - z_range.x) / (z_range.y - z_range.x) - 1.f;
    gl_Position = vec4(pos, 0.f, 1.0f);
}
