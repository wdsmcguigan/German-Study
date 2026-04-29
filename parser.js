/**
 * parser.js
 * Extracts structured data (vocabulary, grammar rules) from HTML rendered by marked.js
 */

export function parseContentTables(htmlString) {
  const data = {
      vocabulary: [],
      grammar: []
  };

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlString;

  const tables = tempDiv.querySelectorAll('table');
  
  tables.forEach(table => {
      // Find POS from preceding heading
      let pos = 'Wort';
      let prev = table.previousElementSibling;
      while (prev) {
          if (prev.tagName.match(/^H[23]$/)) {
              const headingText = prev.textContent.trim();
              if (headingText.includes('Verben')) pos = 'Verb';
              else if (headingText.includes('Nomen')) pos = 'Nomen';
              else if (headingText.includes('Adjektive')) pos = 'Adjektiv';
              else if (headingText.includes('Pronomen')) pos = 'Pronomen';
              else if (headingText.includes('Begrüßung')) pos = 'Phrase';
              else pos = headingText.split(' ')[0]; // Fallback
              break;
          }
          prev = prev.previousElementSibling;
      }

      const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
      const originalHeaders = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = table.querySelectorAll('tbody tr');
      
      const hasDeutsch = headers.includes('deutsch');
      const hasEnglisch = headers.includes('englisch');
      
      if (hasDeutsch && hasEnglisch) {
          const deIdx = headers.indexOf('deutsch');
          const enIdx = headers.indexOf('englisch');
          const articleIdx = headers.indexOf('artikel');
          
          rows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length > Math.max(deIdx, enIdx)) {
                  let de = cells[deIdx].textContent.trim();
                  const en = cells[enIdx].textContent.trim();
                  const article = articleIdx >= 0 && cells.length > articleIdx ? cells[articleIdx].textContent.trim() : '';
                  
                  if (de && en) {
                      const details = {};
                      // Extract all other columns
                      for (let i = 0; i < headers.length; i++) {
                          if (i !== deIdx && i !== enIdx) {
                              const val = cells.length > i ? cells[i].textContent.trim() : '';
                              if (val && val !== '-') {
                                  details[originalHeaders[i]] = val;
                              }
                          }
                      }

                      data.vocabulary.push({ 
                          front: article ? `${article} ${de}` : de, 
                          back: en,
                          type: 'vocab',
                          pos: pos,
                          details: details
                      });
                  }
              }
          });
      } else if (headers.includes('infinitiv')) {
          const infIdx = headers.indexOf('infinitiv');
          rows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length > infIdx) {
                  let inf = cells[infIdx].textContent.trim();
                  if (inf) {
                      const details = {};
                      for (let i = 0; i < headers.length; i++) {
                          if (i !== infIdx) {
                              const val = cells.length > i ? cells[i].textContent.trim() : '';
                              if (val && val !== '-') {
                                  details[originalHeaders[i]] = val;
                              }
                          }
                      }
                      data.vocabulary.push({ 
                          front: inf, 
                          back: '-',
                          type: 'vocab',
                          pos: 'Verb',
                          details: details
                      });
                  }
              }
          });
      } else if (headers.includes('person') && headers.length >= 2) {
          const personIdx = headers.indexOf('person');
          for (let col = 1; col < headers.length; col++) {
              const verbName = headers[col];
              if (verbName === 'person') continue;
              
              rows.forEach(row => {
                  const cells = row.querySelectorAll('td');
                  if (cells.length > Math.max(personIdx, col)) {
                      const person = cells[personIdx].textContent.trim();
                      const form = cells[col].textContent.trim();
                      
                      if (person && form) {
                          data.grammar.push({
                              front: `${person} (${verbName})`,
                              back: form,
                              type: 'grammar'
                          });
                      }
                  }
              });
          }
      }
  });

  return data;
}
