// Function to ensure Resources directory exists
async function ensureResourcesDirectory() {
    try {
        await window.api.ensureDir('Resources');
    } catch (error) {
        console.error('Error creating Resources directory:', error);
    }
}

// Function to save RAWG API Key
async function saveApiKey() {
    const apiKey = document.getElementById('rawgApiKey').value.trim();
    if (apiKey) {
        const success = await window.api.saveApiKey(apiKey);
        if (success) {
            alert('API Key saved successfully!');
        } else {
            alert('Failed to save API Key. Please try again.');
        }
    } else {
        alert('Please enter a valid API Key.');
    }
}

// Load API Key when settings view is opened
document.querySelector('[data-view="settings"]').addEventListener('click', async () => {
    const apiKey = await window.api.getApiKey();
    document.getElementById('rawgApiKey').value = apiKey;
});

// Function to fetch game image from RAWG API and save locally
async function fetchGameImage(title, forceUpdate = false) {
    const apiKey = await window.api.getApiKey();
    if (!apiKey) {
        console.error('No RAWG API Key found. Please set it in the settings.');
        return null;
    }
    const fileName = `Resources/${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.jpg`;

    try {
        await window.api.ensureDir('Resources');

        // Check if image exists locally and we're not forcing an update
        if (!forceUpdate) {
            const exists = await window.api.fileExists(fileName);
            if (exists) {
                const fullPath = await window.api.getResourcePath(fileName);
                return fullPath;
            }
        }

        const response = await fetch(`https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(title)}&page_size=1`);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            const imageUrl = data.results[0].background_image;
            // Download and save image
            const imageResponse = await fetch(imageUrl);
            const blob = await imageResponse.blob();
            
            // Convert blob to base64
            const reader = new FileReader();
            const base64data = await new Promise((resolve) => {
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });

            // Save image locally
            const fullPath = await window.api.writeFile(fileName, base64data.split(',')[1], 'base64');
            return fullPath;
        }
        return null;
    } catch (error) {
        console.error('Error fetching/saving game image:', error);
        return null;
    }
}

// Function to update all game images
async function updateAllGameImages() {
    // Verificar se existe uma API Key configurada
    const apiKey = await window.api.getApiKey();
    if (!apiKey) {
        alert('Please add your RAWG API Key in the settings before updating game images.');
        return;
    }

    const btn = document.getElementById('updateImagesBtn');
    const progress = document.getElementById('imageUpdateProgress');
    const progressBar = progress.querySelector('.progress-bar');
    
    btn.disabled = true;
    progress.style.display = 'block';
    
    await ensureResourcesDirectory();
    
    const games = gameStorage.games;
    let completed = 0;
    
    for (const game of games) {
        // Update progress
        const percent = ((completed / games.length) * 100).toFixed(1);
        progressBar.style.width = percent + '%';
        progressBar.textContent = `${completed}/${games.length} (${percent}%)`;
        
        // Fetch new image
        const newImagePath = await fetchGameImage(game.title, true);
        if (newImagePath) {
            game.imageUrl = newImagePath;
        }
        
        completed++;
    }
    
    // Save updated games
    gameStorage.saveGames();
    
    // Update UI
    progressBar.style.width = '100%';
    progressBar.textContent = 'Completed!';
    btn.disabled = false;
    
    // Refresh games display
    renderGames();
    
    // Hide progress after a delay
    setTimeout(() => {
        progress.style.display = 'none';
        progressBar.style.width = '0%';
        progressBar.textContent = '';
    }, 3000);
}

// Game data storage class
class GameStorage {
    constructor() {
        this.games = [];
        this.toPlayGames = [];
        this.initialize();
    }

    async initialize() {
        await this.loadFromLocalStorage();
        this.initialized = true;
    }

    async loadFromLocalStorage() {
        try {
            const data = await window.api.loadGameData();
            if (data) {
                this.games = data.games || [];
                this.toPlayGames = data.toPlayGames || [];
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.games = [];
            this.toPlayGames = [];
        }
    }

    getGame(id) {
        return this.games.find(g => g.id === id);
    }

    loadGames() {
        return this.games;
    }

    loadToPlayGames() {
        return this.toPlayGames;
    }

    async saveGames() {
        try {
            await window.api.saveGameData({
                games: this.games,
                toPlayGames: this.toPlayGames
            });
        } catch (error) {
            console.error('Error saving games:', error);
        }
    }

    async saveToPlayGames() {
        try {
            await window.api.saveGameData({
                games: this.games,
                toPlayGames: this.toPlayGames
            });
        } catch (error) {
            console.error('Error saving to-play games:', error);
        }
    }

    async addGame(game) {
        const imageUrl = await fetchGameImage(game.title);
        this.games.push({
            ...game,
            id: Date.now(),
            createdAt: new Date().toISOString(),
            isFinished: false,
            completionDate: null,
            imageUrl: imageUrl
        });
        this.saveGames();
    }

    addToPlayGame(game) {
        this.toPlayGames.push({
            ...game,
            id: Date.now(),
            createdAt: new Date().toISOString()
        });
        this.saveToPlayGames();
    }

    moveToPlayed(id, hours = 0) {
        const gameToMove = this.toPlayGames.find(g => g.id === id);
        if (gameToMove) {
            // Remove from to-play list
            this.toPlayGames = this.toPlayGames.filter(g => g.id !== id);
            this.saveToPlayGames();

            // Add to played games
            this.addGame({
                title: gameToMove.title,
                genre: gameToMove.genre,
                tags: gameToMove.tags,
                hours: hours
            });
        }
    }

    updateGameHours(id, hours) {
        const game = this.games.find(g => g.id === id);
        if (game) {
            game.hours = parseFloat(hours);
            this.saveGames();
        }
    }

    async updateGame(id, updatedData) {
        const index = this.games.findIndex(g => g.id === id);
        if (index !== -1) {
            // Se o título mudou, busca uma nova imagem
            let imageUrl = this.games[index].imageUrl;
            if (updatedData.title !== this.games[index].title) {
                imageUrl = await fetchGameImage(updatedData.title);
            }

            this.games[index] = {
                ...this.games[index],
                ...updatedData,
                id: this.games[index].id,
                createdAt: this.games[index].createdAt,
                imageUrl: imageUrl
            };
            this.saveGames();
            return true;
        }
        return false;
    }

    deleteGame(id) {
        this.games = this.games.filter(g => g.id !== id);
        this.saveGames();
    }

    toggleFinished(id) {
        const game = this.games.find(g => g.id === id);
        if (game) {
            game.isFinished = !game.isFinished;
            this.saveGames();
        }
    }

    deleteToPlayGame(id) {
        this.toPlayGames = this.toPlayGames.filter(g => g.id !== id);
        this.saveToPlayGames();
    }

    getStatsByGenre() {
        const stats = {};
        this.games.forEach(game => {
            stats[game.genre] = (stats[game.genre] || 0) + game.hours;
        });
        return stats;
    }

    getStatsByTag() {
        const stats = {};
        this.games.forEach(game => {
            game.tags.forEach(tag => {
                if (tag) {
                    stats[tag] = (stats[tag] || 0) + game.hours;
                }
            });
        });
        return stats;
    }
}

// Initialize game storage
const gameStorage = new GameStorage();

// DOM Elements
const gamesView = document.getElementById('games-view');
const statsView = document.getElementById('stats-view');
const gamesList = document.getElementById('games-list');
const addGameForm = document.getElementById('addGameForm');
const saveGameBtn = document.getElementById('saveGame');
const genreStats = document.getElementById('genre-stats');
const tagStats = document.getElementById('tag-stats');

// Navigation
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = e.target.dataset.view;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        e.target.classList.add('active');
        
        // Hide all views
        document.getElementById('games-view').style.display = 'none';
        document.getElementById('toplay-view').style.display = 'none';
        document.getElementById('stats-view').style.display = 'none';
        document.getElementById('settings-view').style.display = 'none';
        
        // Show selected view
        switch(view) {
            case 'games':
                document.getElementById('games-view').style.display = 'block';
                renderGames();
                break;
            case 'toplay':
                document.getElementById('toplay-view').style.display = 'block';
                renderToPlayGames();
                break;
            case 'stats':
                document.getElementById('stats-view').style.display = 'block';
                updateStats();
                break;
            case 'settings':
                document.getElementById('settings-view').style.display = 'block';
                break;
        }
    });
});

// Save game
saveGameBtn.addEventListener('click', async () => {
    const title = document.getElementById('gameTitle').value;
    const genre = document.getElementById('gameGenre').value;
    const tags = document.getElementById('gameTags').value.split(',').map(tag => tag.trim());
    const hours = parseFloat(document.getElementById('gameHours').value);
    const rating = parseFloat(document.getElementById('gameRating').value);
    const platform = document.getElementById('gamePlatform').value;
    const difficulty = document.getElementById('gameDifficulty').value;

    const game = {
        title,
        genre,
        tags,
        hours,
        rating,
        difficulty,
        platform
    };

    // Disable save button and show loading state
    saveGameBtn.disabled = true;
    saveGameBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';

    await gameStorage.addGame(game);
    
    // Close modal and reset form
    const modal = bootstrap.Modal.getInstance(document.getElementById('addGameModal'));
    modal.hide();
    addGameForm.reset();
    
    // Reset save button state
    saveGameBtn.disabled = false;
    saveGameBtn.innerHTML = 'Save Game';
    
    // Update filters and render
    updateFilters();
    
    renderGames();
});

// Helper function to convert decimal hours to HH:MM format
function formatHoursToTime(hours) {
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Helper function to convert HH:MM format to decimal hours
function timeToHours(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours + (minutes / 60);
}

// Helper function to format completion date
function formatCompletionDate(completionDate) {
    if (!completionDate) return '';
    const date = new Date(completionDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Render games list
function renderGames() {
    gamesList.innerHTML = '';
    
    const searchTerm = document.getElementById('searchGames').value.toLowerCase();
    const selectedGenre = document.getElementById('filterGenre').value;
    
    let filteredGames = gameStorage.games;
    
    // Apply filters
    if (searchTerm) {
        filteredGames = filteredGames.filter(game => 
            game.title.toLowerCase().includes(searchTerm) ||
            game.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }
    
    if (selectedGenre) {
        filteredGames = filteredGames.filter(game => game.genre === selectedGenre);
    }

    // Apply tag filter
    const selectedTag = document.getElementById('filterTag').value;
    if (selectedTag) {
        filteredGames = filteredGames.filter(game => 
            game.tags.includes(selectedTag)
        );
    }

    // Apply year filter
    const selectedYear = document.getElementById('filterYear').value;
    if (selectedYear) {
        filteredGames = filteredGames.filter(game => 
            game.completionDate && 
            new Date(game.completionDate).getFullYear() === parseInt(selectedYear)
        );
    }

    // Apply platform filter
    const selectedPlatform = document.getElementById('filterPlatform').value;
    if (selectedPlatform) {
        filteredGames = filteredGames.filter(game => game.platform === selectedPlatform);
    }

    // Update total playtime
    const totalHours = gameStorage.games.reduce((sum, game) => sum + game.hours, 0);
    document.getElementById('totalPlaytime').textContent = `${totalHours.toFixed(1)} hours`;
    
    // Template HTML for the Games already played
    filteredGames.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'col-md-4';
        gameElement.innerHTML = `
            <div class="card game-card ${game.isFinished ? 'finished-game' : ''}">
                ${game.imageUrl ? `<img src="${game.imageUrl}" class="card-img-top game-cover" alt="${game.title}">` : ''}
                <div class="card-body">
                    <h5 class="card-title">
                        ${game.title}
                        <span class="game-genre">${game.genre}</span>
                    </h5>
                    <div class="mb-3">
                        ${game.tags.map(tag => `<span class="game-tag">${tag}</span>`).join('')}
                    </div>
                    <div class="mb-3 d-flex justify-content-between align-items-center">
                        <div class="game-rating">
                            <i class="fas fa-star text-warning note-icon"></i>
                            <span>${game.rating ? game.rating.toFixed(1) : '-'}/10</span>
                        </div>
                        <span class="game-difficulty difficulty-${game.difficulty?.toLowerCase()}">${game.difficulty || '-'}</span>
                    </div>
                    <div class="playtime-section">
                        <div class="d-flex justify-content-between align-items-center">
                            <label class="text-secondary">Hours Played:</label>
                            <span class="text-white fw-bold">${formatHoursToTime(game.hours)}</span>
                        </div>
                        <div class="progress">
                            <div class="progress-bar" role="progressbar" 
                                style="width: ${Math.min((game.hours / 100) * 100, 100)}%">
                            </div>
                        </div>
                        ${game.completionDate ? `<div class="text-center mt-2 completion-date-info"><i class="fas fa-solid fa-trophy me-2"></i><strong>Zerado em:</strong> ${formatCompletionDate(game.completionDate)}</div>` : ''}
                    </div>
                    <div class="mt-3 d-flex justify-content-end">
                        <button class="btn btn-outline-primary btn-sm" onclick="openEditGame(${game.id})"
                            title="Edit Game">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        gamesList.appendChild(gameElement);
    });
}

// Update game hours
function updateGameHours(gameId, hours) {
    gameStorage.updateGameHours(gameId, hours);
    updateStats();
}

// Delete game
function deleteGame(gameId) {
    if (confirm('Are you sure you want to delete this game?')) {
        gameStorage.deleteGame(gameId);
        renderGames();
        updateStats();
    }
}

// Toggle finished status
function toggleFinished(gameId) {
    gameStorage.toggleFinished(gameId);
    renderGames();
}

// Update statistics
function updateStats() {
    const games = gameStorage.games;
    const totalHours = games.reduce((sum, game) => sum + game.hours, 0);
    const totalGamesCount = games.length;
    
    // Update summary cards
    document.getElementById('totalHours').textContent = totalHours.toFixed(1);
    document.getElementById('totalGames').textContent = totalGamesCount;
    
    // Find most played genre
    const genreData = gameStorage.getStatsByGenre();
    const topGenreEntry = Object.entries(genreData).reduce((a, b) => 
        (a[1] > b[1] ? a : b), ['None', 0]);
    document.getElementById('topGenre').textContent = topGenreEntry[0];
    
    // Genre statistics with progress bars
    genreStats.innerHTML = Object.entries(genreData)
        .sort((a, b) => b[1] - a[1])
        .map(([genre, hours]) => {
            const percentage = (hours / totalHours * 100).toFixed(1);
            return `
                <div class="stat-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <strong>${genre}</strong>
                        <span class="stat-value">${hours.toFixed(1)}h (${percentage}%)</span>
                    </div>
                    <div class="progress mt-2">
                        <div class="progress-bar" role="progressbar" 
                            style="width: ${percentage}%">
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    // Tag statistics with progress bars
    const tagData = gameStorage.getStatsByTag();
    tagStats.innerHTML = Object.entries(tagData)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, hours]) => {
            const percentage = (hours / totalHours * 100).toFixed(1);
            return `
                <div class="stat-item">
                    <div class="d-flex justify-content-between align-items-center">
                        <strong>${tag}</strong>
                        <span class="stat-value">${hours.toFixed(1)}h (${percentage}%)</span>
                    </div>
                    <div class="progress mt-2">
                        <div class="progress-bar" role="progressbar" 
                            style="width: ${percentage}%">
                        </div>
                    </div>
                </div>
            `;
        }).join('');
}

// Initialize search and filters
function updateFilters() {
    // Update genre filter
    const filterGenre = document.getElementById('filterGenre');
    const genres = [...new Set(gameStorage.games.map(game => game.genre))];
    filterGenre.innerHTML = '<option value="">All Genres</option>' +
        genres.map(genre => `<option value="${genre}">${genre}</option>`).join('');

    // Update tag filter
    const filterTag = document.getElementById('filterTag');
    const tags = [...new Set(gameStorage.games.flatMap(game => game.tags))];
    filterTag.innerHTML = '<option value="">All Tags</option>' +
        tags.map(tag => `<option value="${tag}">${tag}</option>`).join('');

    // Update year filter
    const filterYear = document.getElementById('filterYear');
    const years = [...new Set(gameStorage.games
        .filter(game => game.completionDate)
        .map(game => new Date(game.completionDate).getFullYear()))];
    filterYear.innerHTML = '<option value="">All Years</option>' +
        years.sort((a, b) => b - a)
            .map(year => `<option value="${year}">${year}</option>`).join('');

    // Update platform filter
    const filterPlatform = document.getElementById('filterPlatform');
    const platforms = [...new Set(gameStorage.games.map(game => game.platform))];
    filterPlatform.innerHTML = '<option value="">All Platforms</option>' +
        platforms.map(platform => `<option value="${platform}">${platform}</option>`).join('');
}

// Render To Play Games
function renderToPlayGames() {
    const toPlayList = document.getElementById('toplay-list');
    const searchTerm = document.getElementById('searchToPlay').value.toLowerCase();
    
    toPlayList.innerHTML = '';
    
    let filteredGames = gameStorage.toPlayGames;
    if (searchTerm) {
        filteredGames = filteredGames.filter(game => 
            game.title.toLowerCase().includes(searchTerm) ||
            game.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );
    }
    
    // Template HTML for the To be Played Games
    filteredGames.forEach(game => {
        const gameElement = document.createElement('div');
        gameElement.className = 'col-12 mb-2';
        gameElement.innerHTML = `
            <div class="card game-card-list">
                <div class="card-body d-flex justify-content-between align-items-center">
                    <div class="game-info">
                        <h5 class="card-title mb-2">
                            ${game.title}
                            <span class="game-genre">${game.genre}</span>
                        </h5>
                        <div>
                            ${game.tags.map(tag => `<span class="game-tag">${tag}</span>`).join('')}
                        </div>
                    </div>
                    <div class="game-actions d-flex gap-2">
                        <button class="btn btn-success btn-sm" onclick="startPlaying(${game.id})" title="Start Playing">
                            <i class="fas fa-play"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteToPlayGame(${game.id})" title="Delete">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        toPlayList.appendChild(gameElement);
    });
}

// Start Playing (move to played games)
function startPlaying(gameId) {
    gameStorage.moveToPlayed(gameId);
    renderToPlayGames();
    updateGenreFilter();
}

// Delete To Play Game
function deleteToPlayGame(gameId) {
    if (confirm('Are you sure you want to delete this game?')) {
        gameStorage.deleteToPlayGame(gameId);
        renderToPlayGames();
    }
}

// Save To Play Game
document.getElementById('saveToPlay').addEventListener('click', () => {
    const title = document.getElementById('toPlayTitle').value;
    const genre = document.getElementById('toPlayGenre').value;
    const tags = document.getElementById('toPlayTags').value.split(',').map(tag => tag.trim());

    const game = {
        title,
        genre,
        tags
    };

    gameStorage.addToPlayGame(game);
    
    // Close modal and reset form
    const modal = bootstrap.Modal.getInstance(document.getElementById('addToPlayModal'));
    modal.hide();
    document.getElementById('addToPlayForm').reset();
    
    renderToPlayGames();
});

// Clear all data
function clearAllData() {
    if (confirm('Are you sure you want to delete all data? This action cannot be undone.')) {
        localStorage.clear();
        gameStorage.games = [];
        gameStorage.toPlayGames = [];
        renderGames();
        renderToPlayGames();
        updateFilters();
        updateStats();
    }
}

// Event listeners for search and filters
document.getElementById('searchGames').addEventListener('input', renderGames);
document.getElementById('filterGenre').addEventListener('change', renderGames);
document.getElementById('filterTag').addEventListener('change', renderGames);
document.getElementById('filterYear').addEventListener('change', renderGames);
document.getElementById('filterPlatform').addEventListener('change', renderGames);
document.getElementById('searchToPlay').addEventListener('input', renderToPlayGames);

// Clear data button event listener
document.getElementById('clearDataBtn').addEventListener('click', clearAllData);

// Export data function
function exportData() {
    const data = {
        games: gameStorage.games,
        toPlayGames: gameStorage.toPlayGames
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `playedyet-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Import data function
function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.games && data.toPlayGames) {
                if (confirm('This will replace all your current data. Are you sure you want to continue?')) {
                    gameStorage.games = data.games;
                    gameStorage.toPlayGames = data.toPlayGames;
                    gameStorage.saveGames();
                    gameStorage.saveToPlayGames();
                    renderGames();
                    renderToPlayGames();
                    updateGenreFilter();
                    updateStats();
                    alert('Data imported successfully!');
                }
            } else {
                alert('Invalid backup file format!');
            }
        } catch (error) {
            alert('Error importing data: ' + error.message);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

// Open edit game modal
function openEditGame(gameId) {
    const game = gameStorage.getGame(gameId);
    if (game) {
        document.getElementById('editGameId').value = game.id;
        document.getElementById('editGameTitle').value = game.title;
        document.getElementById('editGameGenre').value = game.genre;
        document.getElementById('editGameTags').value = game.tags.join(', ');
        document.getElementById('editGamePlatform').value = game.platform;
        // Convert decimal hours to HH:MM format for time input
        document.getElementById('editGameHours').value = formatHoursToTime(game.hours);
        document.getElementById('editGameRating').value = game.rating || 0;
        document.getElementById('editGameDifficulty').value = game.difficulty || 'A';
        document.getElementById('editGameFinished').checked = game.isFinished || false;
        
        // Populate completionDate field
        if (game.completionDate) {
            // Convert ISO string to YYYY-MM-DD format for input type="date"
            const date = new Date(game.completionDate);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            document.getElementById('editGameCompletionDate').value = `${year}-${month}-${day}`;
        } else {
            document.getElementById('editGameCompletionDate').value = '';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('editGameModal'));
        modal.show();
    }
}

// Save edited game
document.getElementById('saveEditGame').addEventListener('click', async () => {
    const gameId = parseInt(document.getElementById('editGameId').value);
    const completionDateValue = document.getElementById('editGameCompletionDate').value;
    
    const hoursValue = document.getElementById('editGameHours').value;
    
    const updatedGame = {
        title: document.getElementById('editGameTitle').value,
        genre: document.getElementById('editGameGenre').value,
        tags: document.getElementById('editGameTags').value.split(',').map(tag => tag.trim()),
        hours: timeToHours(hoursValue),
        rating: parseFloat(document.getElementById('editGameRating').value),
        difficulty: document.getElementById('editGameDifficulty').value,
        isFinished: document.getElementById('editGameFinished').checked,
        completionDate: completionDateValue ? new Date(completionDateValue).toISOString() : null,
        platform: document.getElementById('editGamePlatform').value
    };

    gameStorage.updateGame(gameId, updatedGame);
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('editGameModal'));
    modal.hide();
    
    updateFilters();
    renderGames();
    updateStats();
});

// Delete game
function deleteGame() {
    const gameId = parseInt(document.getElementById('editGameId').value);
    if (confirm('Are you sure you want to delete this game?')) {
        gameStorage.deleteGame(gameId);
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('editGameModal'));
        modal.hide();
        
        renderGames();
        updateStats();
    }
}

// Initial render
async function initializeApp() {
    await gameStorage.initialize();
    updateFilters(); // Update filters first
    renderGames();
    renderToPlayGames();
    updateStats();
}

initializeApp();