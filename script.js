// script.js (module)
const API_KEY = "a51788fe"; // keep or replace with your own OMDb key

// Elements
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const moviesContainer = document.getElementById("movies");
const recommendedContainer = document.getElementById("recommended");
const likedContainer = document.getElementById("likedMovies");
const clearLikesBtn = document.getElementById("clearLikes");

// Hero elements
const heroTitle = document.getElementById("heroTitle");
const heroPlot = document.getElementById("heroPlot");
const heroPoster = document.getElementById("heroPoster");
const heroWatch = document.getElementById("heroWatch");
const heroLike = document.getElementById("heroLike");

// Modal elements
const modal = document.getElementById("modal");
const modalPoster = document.getElementById("modalPoster");
const modalTitle = document.getElementById("modalTitle");
const modalMeta = document.getElementById("modalMeta");
const modalPlot = document.getElementById("modalPlot");
const modalTrailer = document.getElementById("modalTrailer");
const modalLike = document.getElementById("modalLike");

// Local state
let likedMovies = JSON.parse(localStorage.getItem("likedMovies") || "[]"); // store full movie objects with Genre when possible
let lastSearchResults = []; // store to open modal from a search card
let featuredMovie = null; // featured movie (for hero)

// Utilities
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function saveLikes(){
  localStorage.setItem("likedMovies", JSON.stringify(likedMovies));
  renderLiked();
  renderRecommendations();
  refreshHeroLikeState();
}

function isLikedById(imdbID){ return likedMovies.some(m => m.imdbID === imdbID); }
function toggleLike(movie){
  if(!movie || !movie.imdbID) return;
  if(isLikedById(movie.imdbID)){
    likedMovies = likedMovies.filter(m => m.imdbID !== movie.imdbID);
  } else {
    // keep unique and store movie (prefer object with Genre if available)
    likedMovies.push(movie);
  }
  saveLikes();
}

// Fetch helpers
async function fetchJSON(url){
  try {
    const res = await fetch(url);
    return await res.json();
  } catch(e){
    console.error("Fetch error", e);
    return null;
  }
}

// OMDb search by query (returns Search array or null)
async function omdbSearch(query){
  if(!query) return null;
  const url = `https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(query)}&type=movie`;
  const json = await fetchJSON(url);
  if(!json || json.Response === "False") return null;
  return json.Search;
}

// OMDb get details by id
async function omdbGetById(id){
  if(!id) return null;
  const url = `https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}&plot=full`;
  const json = await fetchJSON(url);
  if(!json || json.Response === "False") return null;
  return json;
}

/* ---------- Rendering ---------- */

function createMovieCard(movie){
  // movie: { Title, Year, Poster, imdbID } or a detail object
  const card = document.createElement("div");
  card.className = "movie-card";
  card.dataset.id = movie.imdbID;

  const poster = movie.Poster && movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/300x450?text=No+Image";
  card.innerHTML = `
    ${ isLikedById(movie.imdbID) ? '<div class="liked-badge">Liked</div>' : '' }
    <img loading="lazy" src="${poster}" alt="${escapeHtml(movie.Title)} poster" />
    <div class="movie-meta">${escapeHtml(movie.Title)} • ${movie.Year || ""}</div>
    <div class="card-actions">
      <button class="watch-btn">Watch</button>
      <button class="like-btn">${ isLikedById(movie.imdbID) ? "Unlike" : "Like" }</button>
    </div>
  `;

  // click handlers
  card.querySelector(".watch-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openTrailerSearch(movie.Title);
  });

  card.querySelector(".like-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    // ensure we have Genre/meta: try fetch details then toggle
    const details = await omdbGetById(movie.imdbID) || movie;
    // normalize object to store more info
    const storeObj = {
      imdbID: details.imdbID,
      Title: details.Title,
      Year: details.Year,
      Poster: details.Poster,
      Genre: details.Genre || "",
      Plot: details.Plot || ""
    };
    toggleLike(storeObj);
  });

  // clicking the card opens modal with details
  card.addEventListener("click", async () => {
    const details = await omdbGetById(movie.imdbID);
    if(details) openModalWith(details);
  });

  return card;
}

function renderMovies(list = [], container){
  container.innerHTML = "";
  if(!list || list.length === 0){
    container.innerHTML = `<p style="padding:12px;color:#6b7280">No movies found.</p>`;
    return;
  }
  list.forEach(m => {
    container.appendChild(createMovieCard(m));
  });
}

function renderLiked(){
  if(likedMovies.length === 0){
    likedContainer.innerHTML = `<p style="padding:12px;color:#6b7280">You haven't liked any movies yet.</p>`;
    return;
  }
  renderMovies(likedMovies, likedContainer);
}

/* ---------- Recommendations ---------- */

// Build a simple genre -> search keyword mapping fallback
function genreToKeyword(genre){
  if(!genre) return "";
  const g = genre.toLowerCase();
  if(g.includes("action")) return "action";
  if(g.includes("comedy")) return "comedy";
  if(g.includes("romance")) return "romance";
  if(g.includes("drama")) return "drama";
  if(g.includes("sci") || g.includes("sci-fi")) return "science fiction";
  if(g.includes("fantasy")) return "fantasy";
  if(g.includes("thriller")) return "thriller";
  if(g.includes("horror")) return "horror";
  return genre.split(",")[0].split(" ")[0]; // fallback: use first word
}

async function renderRecommendations(){
  recommendedContainer.innerHTML = "";
  if(likedMovies.length === 0){
    recommendedContainer.innerHTML = `<p style="padding:12px;color:#6b7280">Like some movies to receive tailored recommendations.</p>`;
    return;
  }

  // compute top genre across liked movies
  const genreCount = {};
  likedMovies.forEach(m => {
    const genres = (m.Genre || "").split(",").map(g => g.trim()).filter(Boolean);
    genres.forEach(g => genreCount[g] = (genreCount[g]||0)+1);
  });
  const sortedGenres = Object.entries(genreCount).sort((a,b) => b[1]-a[1]);
  const primaryGenre = sortedGenres.length ? sortedGenres[0][0] : (likedMovies[0].Genre || "");
  const keyword = genreToKeyword(primaryGenre) || likedMovies[0].Title.split(" ")[0];

  const searchResults = await omdbSearch(keyword);
  if(!searchResults || searchResults.length === 0){
    recommendedContainer.innerHTML = `<p style="padding:12px;color:#6b7280">No recommendations available right now.</p>`;
    return;
  }

  // filter out movies the user already liked and limit to 12
  const filtered = searchResults.filter(m => !isLikedById(m.imdbID)).slice(0, 12);
  if(filtered.length === 0){
    recommendedContainer.innerHTML = `<p style="padding:12px;color:#6b7280">No new recommendations — try liking other genres.</p>`;
    return;
  }
  renderMovies(filtered, recommendedContainer);
}

/* ---------- Hero / Featured ---------- */

async function setFeatured(movie){
  featuredMovie = movie;
  if(!movie){
    heroTitle.textContent = "Featured";
    heroPlot.textContent = "Like movies to make this section personalized. Search to discover movies.";
    heroPoster.src = "";
    heroWatch.onclick = () => {};
    heroLike.onclick = () => {};
    return;
  }
  const details = await (movie.imdbID ? omdbGetById(movie.imdbID) : omdbGetById(movie.imdbID));
  if(!details){
    heroTitle.textContent = movie.Title || "Featured";
    heroPlot.textContent = movie.Plot || "";
    heroPoster.src = movie.Poster && movie.Poster !== "N/A" ? movie.Poster : "";
    return;
  }
  heroTitle.textContent = details.Title + (details.Year ? ` (${details.Year})` : "");
  heroPlot.textContent = details.Plot || "";
  heroPoster.src = details.Poster && details.Poster !== "N/A" ? details.Poster : "";
  heroWatch.onclick = () => openTrailerSearch(details.Title);
  heroLike.onclick = () => {
    const storeObj = {
      imdbID: details.imdbID,
      Title: details.Title,
      Year: details.Year,
      Poster: details.Poster,
      Genre: details.Genre || "",
      Plot: details.Plot || ""
    };
    toggleLike(storeObj);
  };
  refreshHeroLikeState();
}

function refreshHeroLikeState(){
  if(!featuredMovie) return;
  const liked = isLikedById(featuredMovie.imdbID || featuredMovie.imdbID);
  heroLike.textContent = liked ? "Unlike" : "Like";
}

/* ---------- Modal ---------- */
function openModalWith(details){
  if(!details) return;
  modalPoster.src = details.Poster && details.Poster !== "N/A" ? details.Poster : "";
  modalTitle.textContent = `${details.Title} ${details.Year ? `(${details.Year})` : ""}`;
  modalMeta.textContent = `${details.Genre || ""} • ${details.Runtime || ""} • ${details.imdbRating ? `IMDb ${details.imdbRating}` : ""}`;
  modalPlot.textContent = details.Plot || "No description available.";
  modalLike.onclick = () => {
    const storeObj = {
      imdbID: details.imdbID,
      Title: details.Title,
      Year: details.Year,
      Poster: details.Poster,
      Genre: details.Genre || "",
      Plot: details.Plot || ""
    };
    toggleLike(storeObj);
  };
  modalTrailer.onclick = () => openTrailerSearch(details.Title);
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(){
  modal.setAttribute("aria-hidden", "true");
}

/* ---------- Helpers ---------- */
function escapeHtml(str = ""){ return String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function openTrailerSearch(title){
  const q = encodeURIComponent(title + " trailer");
  window.open(`https://www.youtube.com/results?search_query=${q}`, "_blank");
}

/* ---------- Event listeners ---------- */

// Search
searchBtn.addEventListener("click", async () => {
  const q = searchInput.value.trim();
  if(!q) return;
  moviesContainer.innerHTML = `<p style="padding:12px;color:#6b7280">Searching…</p>`;
  const res = await omdbSearch(q);
  lastSearchResults = res || [];
  renderMovies(res || [], moviesContainer);
});

// Allow Enter key
searchInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter") searchBtn.click();
});

// Clear likes
clearLikesBtn.addEventListener("click", () => {
  likedMovies = [];
  saveLikes();
});

// Modal close (backdrop & close button)
document.addEventListener("click", (e) => {
  if(e.target && e.target.dataset && e.target.dataset.close === "true") closeModal();
});
document.addEventListener("keydown", (e) => { if(e.key === "Escape") closeModal(); });

// Initial startup
(async function init(){
  // if we have liked movies, try to set a featured item (most recent liked)
  if(likedMovies.length){
    await setFeatured(likedMovies[likedMovies.length-1]);
  } else {
    // default featured: search a pleasant movie keyword and pick first result
    const defaults = ["Inception","The Grand Budapest Hotel","Coco","La La Land","Interstellar"];
    const pick = defaults[Math.floor(Math.random()*defaults.length)];
    const results = await omdbSearch(pick);
    if(results && results.length) setFeatured(results[0]);
    else setFeatured(null);
  }

  renderLiked();
  renderRecommendations();

  // Load initial popular search (optional): show some popular trending in search box
  const trending = await omdbSearch("Avengers");
  renderMovies(trending || [], moviesContainer);
})();
