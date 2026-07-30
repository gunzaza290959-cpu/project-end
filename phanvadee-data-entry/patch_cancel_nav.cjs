const fs = require('fs');
let content = fs.readFileSync('src/App.jsx', 'utf8');

const getBlock = (funcName) => {
    const startPattern = '    const ' + funcName + ' = ';
    const startIdx = content.indexOf(startPattern);
    if(startIdx === -1) return null;
    let braceCount = 0;
    let endIdx = -1;
    let started = false;
    for(let i=startIdx; i<content.length; i++) {
        if(content[i] === '{') { braceCount++; started = true; }
        if(content[i] === '}') { 
            braceCount--; 
            if(started && braceCount === 0) {
                endIdx = content.indexOf(';', i);
                if(endIdx !== -1 && endIdx - i < 5) return { start: startIdx, end: endIdx + 1, block: content.slice(startIdx, endIdx + 1) };
                return { start: startIdx, end: i + 1, block: content.slice(startIdx, i + 1) };
            }
        }
    }
    return null;
}

const res = getBlock('cancelNavigation');
if (res) {
    let extracted = res.block;
    content = content.slice(0, res.start) + content.slice(res.end);
    
    // Insert before deleteSurveyPoint
    const insertIdx = content.indexOf('    const deleteSurveyPoint = async (id) => {');
    if(insertIdx !== -1) {
        content = content.slice(0, insertIdx) + extracted + '\n\n' + content.slice(insertIdx);
        fs.writeFileSync('src/App.jsx', content);
        console.log('Successfully hoisted cancelNavigation');
    }
}
