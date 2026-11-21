# Rentora public assets

This directory is served by Vite from the site root and copied into `dist/` during builds.

- `/favicon.svg`: browser tab icon
- `/logo/rentora-logo.svg`: header and footer logo
- `/placeholders/car-placeholder.svg`: local fallback when a vehicle image is missing or fails to load
- `/cars/`: optional local demo vehicle photos
- `/banners/`: optional promotional banner assets
- `/site.webmanifest`: installable web-app metadata
- `/robots.txt`: basic crawler rules

Real office-uploaded photos should be stored in Supabase Storage. Demo vehicle photo URLs in `src/App.tsx` currently use Unsplash and therefore need internet access; the local placeholder is used if those images fail.
