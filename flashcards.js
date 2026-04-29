export class FlashcardSystem {
  constructor() {
      this.deck = [];
      this.currentIndex = 0;
      this.isFlipped = false;
      
      // DOM Elements
      this.overlay = document.getElementById('fc-overlay');
      this.card = document.getElementById('fc-card');
      this.frontText = document.getElementById('fc-front-text');
      this.backText = document.getElementById('fc-back-text');
      this.posBadge = document.getElementById('fc-pos-badge');
      this.detailsGrid = document.getElementById('fc-details-grid');
      
      this.btnFlip = document.getElementById('fc-flip-btn');
      this.gradeRow = document.getElementById('fc-grade-row');
      this.btnGradeA = document.getElementById('fc-grade-a');
      this.btnGradeB = document.getElementById('fc-grade-b');
      this.btnGradeC = document.getElementById('fc-grade-c');
      this.btnClose = document.getElementById('fc-close');
      
      this.counter = document.getElementById('fc-counter');
      this.progressBar = document.getElementById('fc-progress-bar');
      
      this.correctCount = 0;
      
      this.bindEvents();
  }
  
  bindEvents() {
      this.btnFlip?.addEventListener('click', () => this.flipCard());
      this.card?.addEventListener('click', () => this.flipCard());
      
      this.btnGradeA?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.gradeCard('A');
      });
      
      this.btnGradeB?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.gradeCard('B');
      });
      
      this.btnGradeC?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.gradeCard('C');
      });
      
      this.btnClose?.addEventListener('click', () => this.close());
  }
  
  start(cards) {
      if (!cards || cards.length === 0) return;
      
      // Sort deck by SRS logic instead of random shuffle
      if (window.progressSystem && window.progressSystem.sortDeckBySRS) {
          this.deck = window.progressSystem.sortDeckBySRS([...cards]);
      } else {
          this.deck = [...cards].sort(() => Math.random() - 0.5);
      }
      
      this.currentIndex = 0;
      this.correctCount = 0;
      
      this.overlay.classList.remove('hidden');
      this.showCard();
  }
  
  showCard() {
      if (this.currentIndex >= this.deck.length) {
          this.finish();
          return;
      }
      
      const card = this.deck[this.currentIndex];
      this.isFlipped = false;
      this.hasBeenRevealed = false;
      this.card.classList.remove('flipped');
      
      // Reset UI
      this.btnFlip.classList.remove('hidden');
      this.gradeRow.classList.add('hidden');
      
      // Update Progress
      this.counter.textContent = `${this.currentIndex + 1} / ${this.deck.length}`;
      const pct = Math.round(((this.currentIndex) / this.deck.length) * 100);
      this.progressBar.style.width = `${pct}%`;
      
      setTimeout(() => {
          this.frontText.textContent = card.front;
          this.backText.textContent = card.back;
          
          if (card.pos) {
              this.posBadge.textContent = card.pos;
              this.posBadge.className = `fc-pos-badge pos-${card.pos.toLowerCase()}`;
              this.posBadge.style.display = 'inline-block';
          } else {
              this.posBadge.style.display = 'none';
          }
          
          this.detailsGrid.innerHTML = '';
          if (card.details && Object.keys(card.details).length > 0) {
              for (const [key, val] of Object.entries(card.details)) {
                  const detailItem = document.createElement('div');
                  detailItem.className = 'fc-detail-item';
                  detailItem.innerHTML = `
                    <div class="fc-detail-label">${key}</div>
                    <div class="fc-detail-val">${val}</div>
                  `;
                  this.detailsGrid.appendChild(detailItem);
              }
          }
      }, 150); // Wait for unflip animation
  }
  
  flipCard() {
      if (this.currentIndex >= this.deck.length) return;
      
      this.isFlipped = !this.isFlipped;
      
      if (this.isFlipped) {
          this.card.classList.add('flipped');
      } else {
          this.card.classList.remove('flipped');
      }
      
      if (!this.hasBeenRevealed) {
          this.hasBeenRevealed = true;
          this.btnFlip.classList.add('hidden');
          this.gradeRow.classList.remove('hidden');
      }
  }
  
  gradeCard(grade) {
      const card = this.deck[this.currentIndex];
      
      // Update SRS
      if (window.progressSystem) {
          window.progressSystem.updateSRS(card.front, grade);
          // For legacy stats
          window.progressSystem.updateWordMastery(card.front, grade === 'A' || grade === 'B');
      }
      
      if (grade === 'A' || grade === 'B') {
          this.correctCount++;
      } else {
          // If C (Hard), append to end of deck so we review it again this session
          this.deck.push(card);
      }
      
      this.nextCard();
  }
  
  nextCard() {
      this.currentIndex++;
      this.showCard();
  }
  
  finish() {
      if (window.progressSystem) {
          // The deck length might be longer now because we appended C grades,
          // so total unique cards is better, but let's use actual repetitions for score
          window.progressSystem.recordSession('flashcard', this.correctCount, this.currentIndex);
      }

      this.progressBar.style.width = '100%';
      this.frontText.innerHTML = `Fertig! 🎉<br><span style="font-size:16px;font-weight:400;color:var(--text-secondary);">${this.currentIndex} Karten gelernt</span>`;
      this.backText.textContent = '';
      this.detailsGrid.innerHTML = '';
      this.posBadge.style.display = 'none';
      this.card.classList.remove('flipped');
      
      this.btnFlip.classList.remove('hidden');
      this.btnFlip.textContent = "Schließen";
      this.gradeRow.classList.add('hidden');
      
      const oldClone = this.btnFlip.cloneNode(true);
      this.btnFlip.parentNode.replaceChild(oldClone, this.btnFlip);
      this.btnFlip = oldClone;
      
      this.btnFlip.addEventListener('click', () => {
          this.close();
          this.btnFlip.textContent = "Karte umdrehen";
          const newClone = this.btnFlip.cloneNode(true);
          this.btnFlip.parentNode.replaceChild(newClone, this.btnFlip);
          this.btnFlip = newClone;
          this.btnFlip.addEventListener('click', () => this.flipCard());
      });
  }
  
  close() {
      this.overlay.classList.add('hidden');
  }
}
