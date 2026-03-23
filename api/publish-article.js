// api/publish-article.js
// Vercel Serverless Function
// À déployer sur Vercel — variables d'environnement requises :
//   GITHUB_TOKEN     → Personal Access Token GitHub (scope: repo)
//   GITHUB_OWNER     → elodiepenarrubia-ui
//   GITHUB_REPO      → agence-aurore.fr
//   PUBLISH_SECRET   → un mot de passe que tu choisis (ex: "aurore2025")

export default async function handler(req, res) {

  // ─── CORS ───
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // ─── AUTH ───
  const secret = req.headers["authorization"]?.replace("Bearer ", "");
  if (secret !== process.env.PUBLISH_SECRET) {
    return res.status(401).json({ error: "Non autorisé" });
  }

  // ─── VALIDATION ───
  const { slug, titre, description, date, contenu } = req.body;

  if (!slug || !titre || !contenu) {
    return res.status(400).json({ error: "Champs manquants : slug, titre, contenu" });
  }

  // ─── GÉNÉRATION DU FICHIER MARKDOWN ───
  const dateObj = new Date(date || new Date());
  const dateStr = dateObj.toISOString();
  const dateForSlug = dateObj.toISOString().split("T")[0]; // 2025-03-23

  const markdown = `---
title: "${titre.replace(/"/g, '\\"')}"
description: "${description.replace(/"/g, '\\"')}"
date: ${dateStr}
---

${contenu}
`;

  // ─── CHEMIN DU FICHIER DANS LE REPO ───
  const filePath = `src/content/blog/${dateForSlug}-${slug}.md`;
  const fileContent = Buffer.from(markdown).toString("base64");

  // ─── APPEL API GITHUB ───
  const githubUrl = `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/contents/${filePath}`;

  try {
    // Vérifier si le fichier existe déjà
    let sha = undefined;
    const checkRes = await fetch(githubUrl, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (checkRes.ok) {
      const existing = await checkRes.json();
      sha = existing.sha; // Nécessaire pour mettre à jour un fichier existant
    }

    // Créer ou mettre à jour le fichier
    const createRes = await fetch(githubUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Article : ${titre}`,
        content: fileContent,
        ...(sha ? { sha } : {}), // Si le fichier existe déjà
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json();
      console.error("GitHub API error:", err);
      return res.status(500).json({ error: "Erreur GitHub API", details: err.message });
    }

    const result = await createRes.json();

    return res.status(200).json({
      success: true,
      message: "Article créé avec succès",
      url: `https://agence-aurore.fr/blog/${slug}/`,
      github_url: result.content?.html_url,
    });

  } catch (err) {
    console.error("Erreur serveur:", err);
    return res.status(500).json({ error: "Erreur serveur", details: err.message });
  }
}
