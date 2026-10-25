// script.js
document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById('animeGrid');
  
  if (typeof animeList !== 'undefined' && animeList.length > 0) {
    animeList.forEach(anime => {
      // পোস্টার না থাকলে প্লেসহোল্ডার
      const posterUrl = anime.poster || 'https://via.placeholder.com/300x400?text=' + anime.title;
      
      const card = document.createElement('a');
      card.href = anime.telegramUrl || "https://t.me/SNAC_hindi_anime";
      card.target = "_blank";
      card.className = 'anime-card';
      
      card.innerHTML = `
        <img src="${posterUrl}" alt="${anime.title}" loading="lazy">
        <div class="card-body">
          <h3 class="card-title">${anime.title}</h3>
          <div class="card-meta">${anime.genre.join(', ')} • ${anime.year}</div>
        </div>
      `;
      grid.appendChild(card);
    });
  } else {
    grid.innerHTML = "<p style='color:gray;'>কোনো Anime পাওয়া যায়নি।</p>";
  }
});