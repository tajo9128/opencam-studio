// Layout presets — define default source positions for common multi-source arrangements
// Each layout assigns transforms to sources by index (0-based)
// Transform: { x, y, width, height } — all values are 0-1 (percentage of canvas)

export const LAYOUTS = [
    {
        id: 'solo',
        name: 'Solo',
        icon: '▣',
        minSources: 1,
        transforms: [
            { x: 0, y: 0, width: 1, height: 1 },
        ],
    },
    {
        id: 'pip',
        name: 'PiP',
        icon: '⊟',
        minSources: 2,
        transforms: [
            { x: 0, y: 0, width: 1, height: 1 },
            { x: 0.72, y: 0.65, width: 0.25, height: 0.3 },
        ],
    },
    {
        id: 'split',
        name: 'Split',
        icon: '▮▮',
        minSources: 2,
        transforms: [
            { x: 0, y: 0, width: 0.5, height: 1 },
            { x: 0.5, y: 0, width: 0.5, height: 1 },
        ],
    },
    {
        id: 'side',
        name: 'Side',
        icon: '▆▃',
        minSources: 2,
        transforms: [
            { x: 0, y: 0, width: 0.67, height: 1 },
            { x: 0.67, y: 0, width: 0.33, height: 0.5 },
            { x: 0.67, y: 0.5, width: 0.33, height: 0.5 },
        ],
    },
    {
        id: 'triple',
        name: 'Triple',
        icon: '▎▎▎',
        minSources: 3,
        transforms: [
            { x: 0, y: 0, width: 0.34, height: 1 },
            { x: 0.33, y: 0, width: 0.34, height: 1 },
            { x: 0.66, y: 0, width: 0.34, height: 1 },
        ],
    },
    {
        id: 'quad',
        name: 'Quad',
        icon: '▦',
        minSources: 4,
        transforms: [
            { x: 0, y: 0, width: 0.5, height: 0.5 },
            { x: 0.5, y: 0, width: 0.5, height: 0.5 },
            { x: 0, y: 0.5, width: 0.5, height: 0.5 },
            { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
        ],
    },
];

export function getLayoutById(id) {
    return LAYOUTS.find(l => l.id === id) || LAYOUTS[0];
}

export function getBestLayoutForSourceCount(count) {
    if (count <= 1) return LAYOUTS[0];
    if (count === 2) return LAYOUTS[2];
    if (count === 3) return LAYOUTS[4];
    return LAYOUTS[5];
}
