// TitleTemplates — SVG-based title cards for overlay
// Pre-built designs: lower third, end card, chapter marker

export const TITLE_TEMPLATES = {
    lowerThird: {
        name: 'Lower Third',
        icon: 'LT',
        description: 'Professional name/title bar at bottom of screen',
        render: (ctx, canvas, params = {}) => {
            const {
                name = 'Speaker Name',
                title = 'Title / Role',
                color = '#8b5cf6',
                textColor = '#ffffff',
                opacity = 0.95,
                y = 0.82, // vertical position (0-1)
            } = params;

            const w = canvas.width;
            const h = canvas.height;
            const barH = h * 0.1;
            const barY = h * y;

            // Background bar
            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.fillStyle = color;
            ctx.fillRect(0, barY, w * 0.45, barH);

            // Accent line
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, barY, 4, barH);

            // Name text
            ctx.fillStyle = textColor;
            ctx.font = `bold ${Math.round(barH * 0.35)}px Outfit, sans-serif`;
            ctx.fillText(name, 20, barY + barH * 0.45);

            // Title text
            ctx.font = `${Math.round(barH * 0.25)}px Outfit, sans-serif`;
            ctx.globalAlpha = opacity * 0.8;
            ctx.fillText(title, 20, barY + barH * 0.78);

            ctx.restore();
        }
    },

    endCard: {
        name: 'End Card',
        icon: 'EC',
        description: 'Closing card with call to action',
        render: (ctx, canvas, params = {}) => {
            const {
                heading = 'Thanks for watching!',
                subheading = 'Like & Subscribe',
                channelName = 'My Channel',
                color = '#8b5cf6',
                textColor = '#ffffff',
            } = params;

            const w = canvas.width;
            const h = canvas.height;

            // Semi-transparent overlay
            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(0, 0, w, h);

            // Centered card
            const cardW = w * 0.6;
            const cardH = h * 0.4;
            const cardX = (w - cardW) / 2;
            const cardY = (h - cardH) / 2;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.beginPath();
            ctx.roundRect(cardX, cardY, cardW, cardH, 20);
            ctx.fill();

            // Accent line at top of card
            ctx.fillStyle = color;
            ctx.fillRect(cardX + cardW * 0.3, cardY, cardW * 0.4, 4);

            // Heading
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.font = `bold ${Math.round(cardH * 0.15)}px Outfit, sans-serif`;
            ctx.fillText(heading, w / 2, cardY + cardH * 0.35);

            // Subheading
            ctx.font = `${Math.round(cardH * 0.08)}px Outfit, sans-serif`;
            ctx.globalAlpha = 0.7;
            ctx.fillText(subheading, w / 2, cardY + cardH * 0.52);

            // Channel name
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.font = `600 ${Math.round(cardH * 0.09)}px Outfit, sans-serif`;
            ctx.fillText(channelName, w / 2, cardY + cardH * 0.72);

            ctx.textAlign = 'start';
            ctx.restore();
        }
    },

    chapterMarker: {
        name: 'Chapter Marker',
        icon: 'CM',
        description: 'Chapter title overlay for section breaks',
        render: (ctx, canvas, params = {}) => {
            const {
                chapterNumber = '01',
                chapterTitle = 'Introduction',
                color = '#8b5cf6',
                textColor = '#ffffff',
                position = 'top-left', // top-left, center
            } = params;

            const w = canvas.width;
            const h = canvas.height;

            ctx.save();

            let x, y;
            if (position === 'center') {
                // Full-screen centered chapter card
                ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                ctx.fillRect(0, 0, w, h);

                ctx.textAlign = 'center';
                ctx.fillStyle = color;
                ctx.font = `bold ${Math.round(h * 0.15)}px Outfit, sans-serif`;
                ctx.fillText(chapterNumber, w / 2, h * 0.4);

                ctx.fillStyle = textColor;
                ctx.font = `300 ${Math.round(h * 0.06)}px Outfit, sans-serif`;
                ctx.fillText(chapterTitle, w / 2, h * 0.55);
            } else {
                // Top-left corner overlay
                x = w * 0.05;
                y = h * 0.05;
                const boxW = w * 0.25;
                const boxH = h * 0.12;

                // Background
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.beginPath();
                ctx.roundRect(x, y, boxW, boxH, 8);
                ctx.fill();

                // Accent left edge
                ctx.fillStyle = color;
                ctx.fillRect(x, y, 4, boxH);

                // Chapter number
                ctx.fillStyle = color;
                ctx.font = `bold ${Math.round(boxH * 0.35)}px Outfit, sans-serif`;
                ctx.fillText(chapterNumber, x + 16, y + boxH * 0.45);

                // Chapter title
                ctx.fillStyle = textColor;
                ctx.font = `${Math.round(boxH * 0.25)}px Outfit, sans-serif`;
                ctx.fillText(chapterTitle, x + 16, y + boxH * 0.78);
            }

            ctx.textAlign = 'start';
            ctx.restore();
        }
    },

    watermark: {
        name: 'Watermark',
        icon: 'WM',
        description: 'Semi-transparent corner watermark',
        render: (ctx, canvas, params = {}) => {
            const {
                text = 'BioDockify Studio',
                position = 'bottom-right', // top-left, top-right, bottom-left, bottom-right
                opacity = 0.4,
                fontSize = 0.03,
            } = params;

            const w = canvas.width;
            const h = canvas.height;

            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.fillStyle = '#ffffff';
            ctx.font = `600 ${Math.round(h * fontSize)}px Outfit, sans-serif`;

            const textW = ctx.measureText(text).width;
            const pad = w * 0.02;

            let x, y;
            switch (position) {
                case 'top-left': x = pad; y = pad + h * fontSize; break;
                case 'top-right': x = w - textW - pad; y = pad + h * fontSize; break;
                case 'bottom-left': x = pad; y = h - pad; break;
                default: x = w - textW - pad; y = h - pad;
            }

            ctx.fillText(text, x, y);
            ctx.restore();
        }
    },
};

export function getTitleTemplateList() {
    return Object.entries(TITLE_TEMPLATES).map(([id, t]) => ({
        id, name: t.name, icon: t.icon, description: t.description,
    }));
}

export function renderTitleTemplate(templateId, ctx, canvas, params) {
    const template = TITLE_TEMPLATES[templateId];
    if (template) {
        template.render(ctx, canvas, params);
    }
}
