// --- Model: Handles data fetching from Hebcal API using XMLHttpRequest ---
const Model = {
    getHebrewDate(gregorianDate) {
        return new Promise((resolve, reject) => {
            const year = gregorianDate.getFullYear();
            const month = gregorianDate.getMonth() + 1; // API uses 1-based months
            const day = gregorianDate.getDate();
            const url = `https://www.hebcal.com/converter?cfg=json&gy=${year}&gm=${month}&gd=${day}&g2h=1`;
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        console.log('Hebcal API response (XHR):', data);
                        if (data && data.hebrew) {
                            let details = `<span title='${data.hd} ${data.hm} ${data.hy}'>${data.hebrew}</span>`;
                            if (Array.isArray(data.events) && data.events.length > 0) {
                                details += '<br><span class="hebrew-events"><strong>Events:</strong> ' + data.events.join(', ') + '</span>';
                            }
                            resolve(details);
                        } else {
                            reject(new Error('Invalid data structure from Hebcal API (Hebrew Date - XHR)'));
                        }
                    } catch (e) {
                        reject(new Error('Error parsing JSON response (Hebrew Date - XHR)'));
                    }
                } else {
                    reject(new Error(`Hebcal API Error (Hebrew Date - XHR): ${xhr.status}`));
                }
            };
            xhr.onerror = function() {
                reject(new Error('Network error fetching Hebrew date (XHR)'));
            };
            xhr.send();
        });
    },

    getZmanim() {
        return new Promise((resolve, reject) => {
            const geonameid = '294074'; // Ness Ziona
            const url = `https://www.hebcal.com/zmanim?cfg=json&geonameid=${geonameid}&tzid=Asia/Jerusalem`;
            const xhr = new XMLHttpRequest();
            xhr.open('GET', url);
            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (data && data.times) {
                            resolve(data.times);
                        } else {
                            reject(new Error('Invalid data structure received for Zmanim (XHR)'));
                        }
                    } catch (e) {
                        reject(new Error('Error parsing JSON response for Zmanim (XHR)'));
                    }
                } else {
                    reject(new Error(`Hebcal API Error (Zmanim - XHR): ${xhr.status}`));
                }
            };
            xhr.onerror = function() {
                reject(new Error('Network error fetching zmanim (XHR)'));
            };
            xhr.send();
        });
    }
};

// --- View: Handles UI rendering ---
const View = {
    updateDateDisplay(gregorianDateStr, hebrewDateStr, gregorianTimeStr) {
        const gregorianElement = document.getElementById('gregorian-date');
        const hebrewElement = document.getElementById('hebrew-date');

        if (gregorianElement) {
            gregorianElement.textContent = `${gregorianDateStr}, ${gregorianTimeStr}`;
        }
        if (hebrewElement) {
            // Allow HTML for rich display (full string, events)
            hebrewElement.innerHTML = hebrewDateStr;
        }
    },

    updateZmanimList(zmanim) {
        const list = document.getElementById('zmanim-list');
        if (!list) return; // Guard clause
        list.innerHTML = ''; // Clear previous content

        if (!zmanim) {
            list.innerHTML = '<li>Error loading times. Please try refreshing.</li>';
            return;
        }

        // Define desired times and their display names
        const timesToShow = {
            alotHaShachar: 'Dawn (Alot HaShachar)',
            neitzHaChama: 'Sunrise (Netz)',
            sofZmanShma: 'Latest Shma (Gra)',
            sofZmanTfilla: 'Latest Shacharit (Gra)',
            chatzot: 'Midday (Chatzot)',
            minchaGedola: 'Earliest Mincha',
            minchaKetana: 'Preferable Mincha',
            plagHaMincha: 'Plag HaMincha',
            shkiah: 'Sunset (Shkiah)',
            tzeit: 'Nightfall (Tzeit)'
        };

        let itemsAdded = 0;
        for (const key in timesToShow) {
            let timeStr = undefined;
            if (key === 'shkiah') {
                // Try shkiah, then sunset
                timeStr = zmanim['shkiah'] || zmanim['sunset'];
            } else if (key === 'tzeit') {
                // Try tzeit, tzeit7083deg, tzeit85deg, tzeit42min, tzeit50min, tzeit72min
                const tzeitKeys = ['tzeit', 'tzeit7083deg', 'tzeit85deg', 'tzeit42min', 'tzeit50min', 'tzeit72min'];
                for (const tkey of tzeitKeys) {
                    if (zmanim[tkey]) {
                        timeStr = zmanim[tkey];
                        break;
                    }
                }
            } else if (key === 'neitzHaChama') {
                // Try neitzHaChama, then sunrise
                timeStr = zmanim['neitzHaChama'] || zmanim['sunrise'];
            } else {
                timeStr = zmanim[key];
            }

            let displayValue = '';
            if (timeStr) {
                try {
                    const time = new Date(timeStr).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                    });
                    displayValue = time;
                } catch (e) {
                    displayValue = 'Invalid time data';
                }
            } else {
                displayValue = 'Not available';
            }
            const li = document.createElement('li');
            li.textContent = `${timesToShow[key]}: ${displayValue}`;
            list.appendChild(li);
            itemsAdded++;
        }

        if (itemsAdded === 0) {
            list.innerHTML = '<li>No specific zmanim available for today.</li>';
        }
    }
};

// --- Controller: Manages interactions and updates ---
const Controller = {
    lastFetchedDate: null, // Store the date (e.g., "YYYY-MM-DD") of the last successful fetch
    intervalId: null,       // Store the ID of the interval timer
    lastHebrewDateStr: 'Loading...', // Store the last fetched Hebrew date string (with HTML)

    async fetchAndDisplayData() {
        console.log("Fetching daily data...");
        const now = new Date();
        const currentDateStr = now.toISOString().slice(0, 10); //YYYY-MM-DD format

        const hebrewStrPromise = Model.getHebrewDate(now);
        const zmanimPromise = Model.getZmanim();

        const [hebrewStr, zmanim] = await Promise.all([hebrewStrPromise, zmanimPromise]);

        // Only update the last fetched date if fetches were reasonably successful
        // (Prevents constant refetching if API fails)
        if (!hebrewStr.includes('Error') && zmanim !== null) {
            this.lastFetchedDate = currentDateStr;
        }
        this.lastHebrewDateStr = hebrewStr; // Store the fetched Hebrew date string

        // Update the view
        this.updateTimeDisplay(); // Initial time display uses current time
        View.updateZmanimList(zmanim); // Update zmanim list
    },

    updateTimeDisplay() {
        const now = new Date();
        const gregorianDateStr = now.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const gregorianTimeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        // Use the stored lastHebrewDateStr instead of reading from the DOM
        const hebrewStr = this.lastHebrewDateStr || 'Loading...';

        View.updateDateDisplay(gregorianDateStr, hebrewStr, gregorianTimeStr);
    },

    startIntervalTimer() {
        if (this.intervalId) {
            clearInterval(this.intervalId); // Clear existing interval if any
        }

        this.intervalId = setInterval(() => {
            // 1. Update the time display every minute
            this.updateTimeDisplay();

            // 2. Check if the date has changed since the last successful fetch
            const todayStr = new Date().toISOString().slice(0, 10);
            if (todayStr !== this.lastFetchedDate) {
                console.log("Date changed detected, refreshing daily data...");
                this.fetchAndDisplayData(); // Fetch new data for the new day
            }
        }, 60000); // 60000ms = 1 minute
    },

    init() {
        this.fetchAndDisplayData(); // Initial data fetch
        this.startIntervalTimer();   // Start the interval timer
    }
};

// --- Start the application ---
document.addEventListener('DOMContentLoaded', () => {
    Controller.init(); // Initialize Hebcal data fetching and time updates

    // --- Auto-scroll logic: Jump from top to bottom and repeat ---
    function startAutoScrollJumpTopBottom() {
        var scrollContainer = document.scrollingElement || document.documentElement;
        var pauseTime = 3000; // ms to pause at top/bottom
        var rafId = null;
        var isPaused = false;

        function recalcMaxScroll() {
            return scrollContainer.scrollHeight - scrollContainer.clientHeight;
        }

        function scrollFrame() {
            if (isPaused) return;
            var maxScroll = recalcMaxScroll();
            if (maxScroll <= 0) return;
            var currentScroll = scrollContainer.scrollTop;

            if (currentScroll < maxScroll) {
                // Scroll to bottom instantly
                window.scrollTo(0, maxScroll);
                isPaused = true;
                setTimeout(function() {
                    // Jump to top after pause
                    window.scrollTo(0, 0);
                    setTimeout(function() {
                        isPaused = false;
                        rafId = requestAnimationFrame(scrollFrame);
                    }, pauseTime);
                }, pauseTime);
            } else {
                // At bottom, jump to top
                window.scrollTo(0, 0);
                setTimeout(function() {
                    isPaused = false;
                    rafId = requestAnimationFrame(scrollFrame);
                }, pauseTime);
            }
        }

        rafId = requestAnimationFrame(scrollFrame);
    }

    // Only enable auto-scroll if content overflows
    setTimeout(function() {
        var scrollContainer = document.scrollingElement || document.documentElement;
        if (scrollContainer.scrollHeight > scrollContainer.clientHeight) {
            startAutoScrollJumpTopBottom();
        }
    }, 1000);
});