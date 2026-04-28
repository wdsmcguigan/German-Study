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
      this.extraText = document.getElementById('fc-extra-text');
      
      this.btnFlip = document.getElementById('fc-flip-btn');
      this.gradeRow = document.getElementById('fc-grade-row');
      this.btnAgain = document.getElementById('fc-again');
      this.btnGotIt = document.getElementById('fc-got-it');
      this.btnClose = document.getElementById('fc-close');
      
      this.counter = document.getElementById('fc-counter');
      this.progressBar = document.getElementById('fc-progress-bar');
      
      this.bindEvents();
  }
  
  bindEvents() {
      this.btnFlip?.addEventListener('click', () => this.flipCard());
      this.card?.addEventListener('click', () => this.flipCard());
      
      this.btnAgain?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.nextCard();
      });
      
      this.btnGotIt?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.nextCard();
      });
      
      this.btnClose?.addEventListener('click', () => this.close());
  }
  
  start(cards) {
      if (!cards || cards.length === 0) return;
      
      // Shuffle deck
      this.deck = [...cards].sort(() => Math.random() - 0.5);
      this.currentIndex = 0;
      
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
          if (card.extra) {
              this.extraText.textContent = card.extra;
              this.extraText.style.display = 'block';
          } else {
              this.extraText.style.display = 'none';
          }
      }, 150); // Wait for unflip animation
  }
  
  flipCard() {
      if (this.isFlipped) return;
      
      this.isFlipped = true;
      this.card.classList.add('flipped');
      
      this.btnFlip.classList.add('hidden');
      this.gradeRow.classList.remove('hidden');
  }
  
  nextCard() {
      this.currentIndex++;
      this.showCard();
  }
  
  finish() {
      this.progressBar.style.width = '100%';
      this.frontText.innerHTML = `Fertig! 🎉<br><span style="font-size:16px;font-weight:400;color:var(--text-secondary);">${this.deck.length} Karten gelernt</span>`;
      this.backText.textContent = '';
      this.extraText.textContent = '';
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
