# Lucide Animated icons

Installed from the official https://lucide-animated.com/r/ registry with shadcn.
Source: https://github.com/pqoqubbw/icons. MIT license is included in this folder.

Animation paths, variants, and timing are unchanged. The only source adaptation
is the root `div` and its event types becoming `span`, so icons can safely appear
inside inline text and buttons without invalid HTML.

Use `../animated-icon.tsx` in product components. It calls the supplied handles
from parent hover, keyboard focus, and pointer press; honors reduced motion;
and reserves a stable icon box. Add `data-animated-icon-trigger` to choose an
explicit containing surface. Avoid adding separate transforms to the SVG.
