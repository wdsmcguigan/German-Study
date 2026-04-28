import { showToast } from './app.js';
import { ProgressSystem } from './progress.js';

export class QuizSystem {
    constructor() {
        this.questions = [];
        this.currentIndex = 0;
        this.score = 0;
        this.progress = new ProgressSystem();
        
        // DOM Elements
        this.overlay = document.getElementById('overlay-quiz');
        this.questionText = document.getElementById('quiz-question-text');
        this.scoreVal = document.getElementById('quiz-score-val');
        this.mcOptions = document.getElementById('quiz-mc-options');
        this.inputBox = document.getElementById('quiz-input-box');
        this.textInput = document.getElementById('quiz-text-input');
        this.btnSubmit = document.getElementById('quiz-submit-btn');
        this.btnClose = document.getElementById('close-quiz');
        
        this.bindEvents();
    }
    
    bindEvents() {
        this.btnClose?.addEventListener('click', () => this.close());
        
        this.btnSubmit?.addEventListener('click', () => this.handleTextInput());
        
        this.textInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleTextInput();
        });
        
        // Umlaut helpers
        document.querySelectorAll('.umlaut-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const char = btn.textContent;
                const start = this.textInput.selectionStart;
                const end = this.textInput.selectionEnd;
                const text = this.textInput.value;
                this.textInput.value = text.substring(0, start) + char + text.substring(end);
                this.textInput.focus();
                this.textInput.setSelectionRange(start + 1, start + 1);
            });
        });
    }
    
    start(vocabList) {
        if (!vocabList || vocabList.length < 4) {
            showToast('Mindestens 4 Vokabeln für das Quiz benötigt.');
            return;
        }
        
        this.progress.init();
        
        // Generate mixed questions (MC and Fill-in-the-blank)
        this.questions = this.generateQuestions(vocabList);
        this.currentIndex = 0;
        this.score = 0;
        this.updateScoreDisplay();
        
        this.overlay.classList.remove('hidden');
        this.showQuestion();
    }
    
    generateQuestions(vocab) {
        const questions = [];
        const numQuestions = Math.min(10, vocab.length);
        const shuffled = [...vocab].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < numQuestions; i++) {
            const currentItem = shuffled[i];
            const isMC = Math.random() > 0.5; // 50% chance of Multiple Choice
            
            if (isMC) {
                // Generate 3 wrong options
                const wrongOptions = [];
                const pool = [...vocab].filter(v => v !== currentItem);
                pool.sort(() => Math.random() - 0.5);
                
                for (let j = 0; j < 3 && j < pool.length; j++) {
                    wrongOptions.push(pool[j].back); // English translation
                }
                
                const allOptions = [...wrongOptions, currentItem.back].sort(() => Math.random() - 0.5);
                
                questions.push({
                    type: 'mc',
                    prompt: currentItem.front,
                    correctAnswer: currentItem.back,
                    options: allOptions,
                    wordData: currentItem
                });
            } else {
                // Fill in the blank (German side)
                questions.push({
                    type: 'input',
                    prompt: currentItem.back, // Show English
                    correctAnswer: currentItem.front, // Ask for German
                    wordData: currentItem
                });
            }
        }
        
        return questions;
    }
    
    showQuestion() {
        if (this.currentIndex >= this.questions.length) {
            this.finish();
            return;
        }
        
        const q = this.questions[this.currentIndex];
        this.questionText.textContent = q.prompt;
        
        if (q.type === 'mc') {
            this.inputBox.classList.add('hidden');
            this.mcOptions.classList.remove('hidden');
            this.mcOptions.innerHTML = '';
            
            q.options.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'quiz-option-btn';
                btn.textContent = opt;
                btn.addEventListener('click', () => this.handleMCOption(opt, btn));
                this.mcOptions.appendChild(btn);
            });
        } else {
            this.mcOptions.classList.add('hidden');
            this.inputBox.classList.remove('hidden');
            this.textInput.value = '';
            setTimeout(() => this.textInput.focus(), 100);
        }
    }
    
    handleMCOption(selectedOption, btnElement) {
        // Prevent multiple clicks
        if (this.mcOptions.classList.contains('locked')) return;
        this.mcOptions.classList.add('locked');
        
        const q = this.questions[this.currentIndex];
        const isCorrect = selectedOption === q.correctAnswer;
        
        if (isCorrect) {
            btnElement.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
            btnElement.style.borderColor = 'var(--success)';
            this.score++;
            this.updateScoreDisplay();
        } else {
            btnElement.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            btnElement.style.borderColor = 'var(--error)';
            
            // Highlight correct answer
            Array.from(this.mcOptions.children).forEach(child => {
                if (child.textContent === q.correctAnswer) {
                    child.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
                    child.style.borderColor = 'var(--success)';
                }
            });
        }
        
        this.progress.updateWordMastery(q.wordData.front, isCorrect);
        
        setTimeout(() => {
            this.mcOptions.classList.remove('locked');
            this.currentIndex++;
            this.showQuestion();
        }, 1500);
    }
    
    handleTextInput() {
        const q = this.questions[this.currentIndex];
        const userAnswer = this.textInput.value.trim().toLowerCase();
        const correctAnswer = q.correctAnswer.toLowerCase();
        
        // Basic fuzzy match to ignore exact article mismatch if just practicing word
        const isCorrect = userAnswer === correctAnswer || 
                          correctAnswer.endsWith(` ${userAnswer}`) || 
                          userAnswer === correctAnswer.replace(/^(der|die|das)\s+/i, '');
        
        if (isCorrect) {
            this.textInput.style.borderColor = 'var(--success)';
            this.textInput.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            this.score++;
            this.updateScoreDisplay();
        } else {
            this.textInput.style.borderColor = 'var(--error)';
            this.textInput.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            showToast(`Falsch. Richtig ist: ${q.correctAnswer}`);
        }
        
        this.progress.updateWordMastery(q.wordData.front, isCorrect);
        
        this.btnSubmit.disabled = true;
        setTimeout(() => {
            this.textInput.style.borderColor = '';
            this.textInput.style.backgroundColor = 'var(--bg-surface)';
            this.btnSubmit.disabled = false;
            this.currentIndex++;
            this.showQuestion();
        }, 1500);
    }
    
    updateScoreDisplay() {
        if (this.scoreVal) {
            this.scoreVal.textContent = this.score;
        }
    }
    
    finish() {
        this.progress.recordSession('quiz', this.score, this.questions.length);
        
        this.questionText.textContent = 'Quiz beendet!';
        this.inputBox.classList.add('hidden');
        this.mcOptions.classList.remove('hidden');
        this.mcOptions.innerHTML = `
            <div style="text-align:center;padding:24px;">
                <div style="font-size:48px;font-weight:bold;color:var(--accent-color);margin-bottom:16px;">
                    ${this.score} / ${this.questions.length}
                </div>
                <p style="color:var(--text-secondary);margin-bottom:24px;">Punkte erreicht</p>
                <button class="quiz-submit-btn" id="quiz-close-btn" style="width:100%;">Schließen</button>
            </div>
        `;
        
        document.getElementById('quiz-close-btn').addEventListener('click', () => this.close());
    }
    
    close() {
        this.overlay.classList.add('hidden');
    }
}
