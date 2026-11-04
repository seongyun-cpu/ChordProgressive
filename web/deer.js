// 작은 픽셀 사슴. SVG여서 확대와 PNG 저장에도 선명하다.
const NS = "http://www.w3.org/2000/svg";
const palette = {
  x: "#211b17",
  b: "#95601f",
  s: "#b67b29",
  l: "#dda24f",
  p: "#f2c18c",
  w: "#fff4dc",
  e: "#b86a62",
};
const body = [
  "...........xxxx.................",
  "..........xbbbbx................",
  ".....xxxxxxbssbxxxx..............",
  "...xxbbsssssssbbeexx............",
  "..xbbssssssssbbxeeeex...........",
  "..xbssllssssssbxxxxx............",
  ".xbsslppplssssbx................",
  ".xbslpxxxplsssbx................",
  ".xbslpxwxplsssbx................",
  ".xbslpxxxplsssbx................",
  "xbsslpxxxplsssbx................",
  "xbssllppplsssbx.................",
  "xppssssssssbbbx.............xxx..",
  "xppppsssssbbxxbxx..........xbsbx.",
  ".xxxxxxxxxxblssssxxx......xbslbx.",
  ".........xppplssssssxxxxxxbsbbx..",
  ".........xppplssssssplsssbbbx....",
  "..........xpplsssslssssplsbx.....",
  "...........xblsssplsssssssbx.....",
  "...........xblssssssssssbbx......",
  "............xbblllpppplbbx......",
  ".............xxxxxxxxxxxx.......",
];
// 4개의 보폭: 뻗기 → 모으기 → 반대쪽 뻗기 → 모으기.
const legs = [
  [
    [12, 20, 3, 6],
    [12, 25, 2, 3],
    [11, 27, 4, 2],
    [21, 20, 3, 4],
    [23, 23, 3, 3],
    [25, 25, 3, 2],
    [27, 26, 3, 2],
  ],
  [
    [13, 20, 3, 4],
    [15, 23, 3, 3],
    [17, 25, 3, 2],
    [21, 20, 3, 4],
    [20, 23, 3, 4],
    [19, 26, 4, 2],
  ],
  [
    [13, 20, 3, 4],
    [10, 23, 4, 3],
    [8, 25, 4, 2],
    [6, 26, 4, 2],
    [22, 20, 3, 6],
    [23, 25, 2, 3],
    [23, 27, 4, 2],
  ],
  [
    [13, 20, 3, 4],
    [14, 23, 3, 4],
    [14, 26, 4, 2],
    [21, 20, 3, 4],
    [18, 23, 3, 3],
    [16, 25, 4, 2],
  ],
];
function element(tag, attributes, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  parent.append(node);
  return node;
}
export function mountDeer(svg) {
  const root = element(
    "g",
    {
      class: "deer",
      transform: "translate(-56,-50) scale(3.5)",
      "aria-hidden": "true",
      "pointer-events": "none",
      "shape-rendering": "crispEdges",
    },
    svg,
  );
  const sprite = element("g", { class: "deer-bounce" }, root);
  legs.forEach((pose, index) => {
    const frame = element(
      "g",
      {
        class: `deer-frame deer-frame-${index}`,
        style: `--phase:${(4 - index) % 4}`,
      },
      sprite,
    );
    // 뒤쪽 다리는 한 톤 어둡게 그린다.
    for (const [x, y, w, h] of pose) {
      element(
        "rect",
        { x: x + 2, y: y - 1, width: w, height: h, fill: palette.b },
        frame,
      );
    }
    for (const [x, y, w, h] of pose) {
      element("rect", { x, y, width: w, height: h, fill: palette.x }, frame);
      if (h >= 3)
        element(
          "rect",
          {
            x: x + 1,
            y,
            width: Math.max(1, w - 1),
            height: h - 1,
            fill: palette.s,
          },
          frame,
        );
    }
  });
  body.forEach((row, y) =>
    [...row].forEach((pixel, x) => {
      if (palette[pixel])
        element(
          "rect",
          { x, y, width: 1, height: 1, fill: palette[pixel] },
          sprite,
        );
    }),
  );
  return root;
}
