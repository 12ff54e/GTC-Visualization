#version 300 es
precision mediump float;

in float val;
out vec4 frag_color;

uniform sampler2D color_map;

void main() {
    frag_color = texture(color_map, vec2(.5f * (val + 1.f), 0.5f));
}
