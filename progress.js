/**
 * progress.js
 * Handles tracking mastery, study streaks, and session history in localStorage
 */

export class ProgressSystem {
    constructor() {
        this.data = {
            mastery: {}, // word -> level (0: new, 1: learning, 2: mastered)
            streak: 0,
            lastStudyDate: null,
            sessionsCompleted: 0,
            recentSessions: []
        };
    }

    init() {
        this.load();
        this.checkStreak();
    }

    load() {
        const saved = localStorage.getItem('germanStudyProgress');
        if (saved) {
            try {
                this.data = { ...this.data, ...JSON.parse(saved) };
            } catch (e) {
                console.error("Failed to load progress", e);
            }
        }
    }

    save() {
        localStorage.setItem('germanStudyProgress', JSON.stringify(this.data));
    }

    checkStreak() {
        if (!this.data.lastStudyDate) return;

        const today = new Date().toDateString();
        const last = new Date(this.data.lastStudyDate);
        
        // If it's a different day
        if (last.toDateString() !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            // If the last study date was NOT yesterday (streak broken)
            if (last.toDateString() !== yesterday.toDateString()) {
                this.data.streak = 0; // reset streak
            }
        }
        this.save();
    }

    recordSession(type, score, total) {
        const today = new Date().toDateString();
        
        // Update streak
        if (this.data.lastStudyDate !== today) {
            this.data.streak += 1;
            this.data.lastStudyDate = today;
        }

        this.data.sessionsCompleted += 1;
        
        const session = {
            id: Date.now(),
            date: new Date().toISOString(),
            type: type,
            score: score,
            total: total
        };

        this.data.recentSessions.unshift(session);
        if (this.data.recentSessions.length > 5) {
            this.data.recentSessions.pop();
        }

        this.save();
    }

    updateWordMastery(word, isCorrect) {
        let level = this.data.mastery[word] || 0;
        
        if (isCorrect) {
            level = Math.min(2, level + 1); // Max level 2 (mastered)
        } else {
            level = Math.max(0, level - 1); // Min level 0 (new/learning)
        }
        
        this.data.mastery[word] = level;
        this.save();
    }

    getMasteredCount() {
        return Object.values(this.data.mastery).filter(level => level === 2).length;
    }

    updateUI() {
        const streakEl = document.getElementById('stat-streak');
        const masteredEl = document.getElementById('stat-mastered');
        const sessionsEl = document.getElementById('stat-sessions');
        
        if (streakEl) streakEl.textContent = `${this.data.streak} Tage`;
        if (masteredEl) masteredEl.textContent = this.getMasteredCount();
        if (sessionsEl) sessionsEl.textContent = this.data.sessionsCompleted;

        // Update recent sessions list
        const listEl = document.getElementById('recent-sessions');
        if (listEl) {
            listEl.innerHTML = '';
            if (this.data.recentSessions.length === 0) {
                listEl.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:20px;">Noch keine Sessions absolviert.</p>';
            } else {
                this.data.recentSessions.forEach(sess => {
                    const date = new Date(sess.date);
                    const dateStr = `${date.getDate()}.${date.getMonth()+1}.${date.getFullYear()}`;
                    
                    const el = document.createElement('div');
                    el.style.cssText = `
                        background: var(--bg-surface);
                        border: 1px solid var(--border-color);
                        padding: 16px;
                        border-radius: var(--radius-md);
                        margin-bottom: 12px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                    `;
                    el.innerHTML = `
                        <div>
                            <div style="font-weight:600;">${sess.type === 'flashcard' ? 'Flashcards' : 'Quiz'}</div>
                            <div style="font-size:12px;color:var(--text-secondary);">${dateStr}</div>
                        </div>
                        <div style="font-weight:700;color:var(--accent-color);">
                            ${sess.score} / ${sess.total}
                        </div>
                    `;
                    listEl.appendChild(el);
                });
            }
        }
    }
}
