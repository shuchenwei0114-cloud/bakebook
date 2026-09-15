# BakeBook

A mobile-first personal baking recipe website designed to feel like an app on iPhone while remaining a normal website.

## Planned architecture

- Frontend: static HTML/CSS/JavaScript
- Hosting: GitHub Pages
- Recipe data: `data/recipes.json`
- Categories: `data/categories.json`
- Images: compressed web images under `images/`
- Writes: future secure serverless endpoint that updates GitHub through the GitHub API (no token stored in frontend code)

## First milestone

The current version provides the mobile UI shell and reads recipe/category data from JSON files. The secure cloud write flow will be connected next.
