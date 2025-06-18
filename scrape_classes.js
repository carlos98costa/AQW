const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises; // Usando fs.promises para async/await

async function scrapeClasses() {
    try {
        const response = await axios.get('http://aqwwiki.wikidot.com/classes');
        const $ = cheerio.load(response.data);
        const classes = [];

        // Adapte este seletor para pegar os elementos corretos na página
        $('table.wiki-content-table a').each((index, element) => {
            const name = $(element).text().trim();
            if (name) {
                classes.push({ name: name });
            }
        });

        return classes;
    } catch (error) {
        console.error('Erro ao fazer web scraping:', error);
        return [];
    }
}

async function main() {
    const classes = await scrapeClasses();
    if (classes.length > 0) {
        try {
            await fs.writeFile('classes.json', JSON.stringify(classes, null, 2), 'utf8');
            console.log('Lista de classes salva em classes.json');
        } catch (error) {
            console.error('Erro ao salvar o arquivo:', error);
        }
    } else {
        console.log('Nenhuma classe encontrada.');
    }
}

main();