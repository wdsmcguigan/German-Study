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
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
      const rows = table.querySelectorAll('tbody tr');
      
      const hasDeutsch = headers.includes('deutsch');
      const hasEnglisch = headers.includes('englisch');
      
      if (hasDeutsch && hasEnglisch) {
          const deIdx = headers.indexOf('deutsch');
          const enIdx = headers.indexOf('englisch');
          const articleIdx = headers.indexOf('artikel');
          const pluralIdx = headers.indexOf('plural');
          
          rows.forEach(row => {
              const cells = row.querySelectorAll('td');
              if (cells.length > Math.max(deIdx, enIdx)) {
                  let de = cells[deIdx].textContent.trim();
                  const en = cells[enIdx].textContent.trim();
                  let article = articleIdx >= 0 && cells.length > articleIdx ? cells[articleIdx].textContent.trim() : '';
                  let plural = pluralIdx >= 0 && cells.length > pluralIdx ? cells[pluralIdx].textContent.trim() : '';
                  
                  if (de && en) {
                      data.vocabulary.push({ 
                          front: article ? `${article} ${de}` : de, 
                          back: en,
                          type: 'vocab',
                          extra: plural ? `Plural: ${plural}` : ''
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
