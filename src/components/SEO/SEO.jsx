import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * SEO component to handle dynamic metadata and canonical tags
 * @param {Object} props
 * @param {string} props.title - Page title
 * @param {string} props.description - Meta description
 * @param {string} [props.canonicalPath] - Optional override for canonical path
 */
const SEO = ({ title, description, canonicalPath }) => {
    const location = useLocation();
    const siteUrl = 'https://opencam-studio.app';
    const currentPath = canonicalPath || location.pathname;

    // Ensure no trailing slash and consistent domain prefix
    const cleanPath = currentPath === '/' ? '' : currentPath.replace(/\/$/, "");
    const canonicalUrl = `${siteUrl}${cleanPath}`;

    useEffect(() => {
        // 1. Update Title
        if (title) {
            document.title = title;
        }

        // 2. Update Meta Description
        let metaDescription = document.querySelector('meta[name="description"]');
        if (description) {
            if (metaDescription) {
                metaDescription.setAttribute('content', description);
            } else {
                metaDescription = document.createElement('meta');
                metaDescription.name = 'description';
                metaDescription.content = description;
                document.head.appendChild(metaDescription);
            }
        }

        // 3. Update Canonical Tag
        let canonicalLink = document.querySelector('link[rel="canonical"]');
        if (canonicalLink) {
            canonicalLink.setAttribute('href', canonicalUrl);
        } else {
            canonicalLink = document.createElement('link');
            canonicalLink.rel = 'canonical';
            canonicalLink.href = canonicalUrl;
            document.head.appendChild(canonicalLink);
        }

        // 4. Update Open Graph Tags (Basic)
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && title) ogTitle.setAttribute('content', title);

        const ogUrl = document.querySelector('meta[property="og:url"]');
        if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);

    }, [title, description, canonicalUrl]);

    return null; // This component doesn't render anything
};

export default SEO;
