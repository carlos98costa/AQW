import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import sanitizeHtml from 'sanitize-html';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();

// Configuração CORS
const corsOptions = {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(helmet({
    contentSecurityPolicy: false, // Desabilitando temporariamente para desenvolvimento
    crossOriginEmbedderPolicy: false,
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));

// Servir arquivos estáticos
app.use(express.static(__dirname));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Muitas requisições deste IP. Tente novamente em 15 minutos.'
});
app.use('/api/', limiter);

// Configuração do Banco de Dados
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'aqw_tierlist',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const dbPool = mysql.createPool(dbConfig);

// Validação de Conexão
dbPool.getConnection()
    .then(conn => {
        console.log('✅ Conectado ao MySQL');
        conn.release();
    })
    .catch(err => {
        console.error('❌ Erro de conexão MySQL:', err);
        process.exit(1);
    });

// Utilitários
const sanitizeInput = (input) => {
    return sanitizeHtml(String(input), {
        allowedTags: [],
        allowedAttributes: {}
    }).replace(/[^a-zA-Z0-9\s._-]/g, '');
};

const executeQuery = async (sql, params = []) => {
    const conn = await dbPool.getConnection();
    try {
        const [results] = await conn.query(sql, params);
        return results;
    } finally {
        conn.release();
    }
};

// Rotas da API
app.get('/api/maps', async (req, res) => {
    try {
        const results = await executeQuery('SELECT name, modifier FROM maps');
        const maps = results.reduce((acc, { name, modifier }) => 
            ({ ...acc, [name]: parseFloat(modifier) }), {});
        res.json({ success: true, data: maps });
    } catch (error) {
        handleError(res, 500, 'Erro ao buscar mapas', error);
    }
});

app.post('/api/maps', async (req, res) => {
    try {
        const { name, modifier } = req.body;
        const sanitizedName = sanitizeInput(name);
        const parsedModifier = parseFloat(modifier);

        if (!sanitizedName || isNaN(parsedModifier) || parsedModifier < 0) {
            return handleError(res, 400, 'Dados inválidos para mapa');
        }

        await executeQuery(
            'INSERT INTO maps (name, modifier) VALUES (?, ?) ON DUPLICATE KEY UPDATE modifier = VALUES(modifier)',
            [sanitizedName, parsedModifier]
        );
        
        res.status(201).json({ success: true, message: 'Mapa atualizado' });
    } catch (error) {
        handleError(res, 500, 'Erro ao salvar mapa', error);
    }
});

app.post('/api/maps/bulk', async (req, res) => {
    try {
        const maps = req.body;
        if (!Array.isArray(maps)) {
            return handleError(res, 400, 'Formato de dados inválido');
        }

        const values = maps.map(({ name, modifier }) => [
            sanitizeInput(name),
            parseFloat(modifier)
        ]).filter(([name, modifier]) => name && !isNaN(modifier) && modifier >= 0);

        if (values.length === 0) {
            return handleError(res, 400, 'Nenhum dado válido fornecido');
        }

        await executeQuery(
            'INSERT INTO maps (name, modifier) VALUES ? ON DUPLICATE KEY UPDATE modifier = VALUES(modifier)',
            [values]
        );

        res.json({ success: true, updated: values.length });
    } catch (error) {
        handleError(res, 500, 'Erro ao processar mapas em massa', error);
    }
});

app.delete('/api/maps/:name', async (req, res) => {
    try {
        const name = sanitizeInput(req.params.name);
        const result = await executeQuery('DELETE FROM maps WHERE name = ?', [name]);
        
        if (result.affectedRows === 0) {
            return handleError(res, 404, 'Mapa não encontrado');
        }
        
        res.json({ success: true, message: 'Mapa removido' });
    } catch (error) {
        handleError(res, 500, 'Erro ao deletar mapa', error);
    }
});

app.get('/api/classes', async (req, res) => {
    try {
        const results = await executeQuery(`
            SELECT c.name, c.mpm, cat.name AS category, t.name AS tier 
            FROM classes c
            JOIN categories cat ON c.category_id = cat.id
            JOIN tiers t ON c.tier_id = t.id
        `);

        const classes = results.reduce((acc, row) => {
            acc[row.category] = acc[row.category] || {};
            acc[row.category][row.tier] = acc[row.category][row.tier] || [];
            acc[row.category][row.tier].push({ 
                name: row.name, 
                mpm: parseFloat(row.mpm) || 0 
            });
            return acc;
        }, {});

        console.log('Classes grouped by category and tier:', JSON.stringify(classes, null, 2));
        res.json({ success: true, data: classes });
    } catch (error) {
        handleError(res, 500, 'Erro ao buscar classes', error);
    }
});

app.post('/api/classes', async (req, res) => {
    try {
        const { name, category, tier, mpm = 0 } = req.body;
        const sanitizedName = sanitizeInput(name);
        const sanitizedCategory = sanitizeInput(category);
        const sanitizedTier = sanitizeInput(tier);
        const parsedMpm = parseFloat(mpm);

        if (!sanitizedName || !sanitizedCategory || !sanitizedTier) {
            return handleError(res, 400, 'Dados obrigatórios ausentes');
        }

        if (isNaN(parsedMpm) || parsedMpm < 0) {
            return handleError(res, 400, 'MPM inválido');
        }

        const [categoryResult] = await executeQuery(
            'SELECT id FROM categories WHERE name = ?', 
            [sanitizedCategory]
        );
        const [tierResult] = await executeQuery(
            'SELECT id FROM tiers WHERE name = ?', 
            [sanitizedTier]
        );

        if (!categoryResult || !tierResult) {
            return handleError(res, 400, 'Categoria ou tier inválido');
        }

        await executeQuery(
            `INSERT INTO classes (name, category_id, tier_id, mpm)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
               tier_id = VALUES(tier_id),
               mpm = VALUES(mpm)`,
            [sanitizedName, categoryResult.id, tierResult.id, parsedMpm]
        );

        res.status(201).json({ success: true, message: 'Classe salva' });
    } catch (error) {
        handleError(res, 500, 'Erro ao salvar classe', error);
    }
});

app.post('/api/classes/bulk', async (req, res) => {
    try {
        const classes = req.body;
        if (!Array.isArray(classes)) {
            return handleError(res, 400, 'Formato de dados inválido');
        }

        let processed = 0;
        for (const cls of classes) {
            const { name, category, tier, mpm = 0 } = cls;
            const sanitizedName = sanitizeInput(name);
            const sanitizedCategory = sanitizeInput(category);
            const sanitizedTier = sanitizeInput(tier);
            const parsedMpm = parseFloat(mpm);

            if (!sanitizedName || !sanitizedCategory || !sanitizedTier || isNaN(parsedMpm) || parsedMpm < 0) {
                console.warn(`Dados inválidos para ${name}`);
                continue;
            }

            const [categoryResult] = await executeQuery(
                'SELECT id FROM categories WHERE name = ?', 
                [sanitizedCategory]
            );
            const [tierResult] = await executeQuery(
                'SELECT id FROM tiers WHERE name = ?', 
                [sanitizedTier]
            );

            if (!categoryResult || !tierResult) {
                console.warn(`Categoria/Tier inválido para ${name}`);
                continue;
            }

            await executeQuery(
                `INSERT INTO classes (name, category_id, tier_id, mpm)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE 
                   tier_id = VALUES(tier_id),
                   mpm = VALUES(mpm)`,
                [sanitizedName, categoryResult.id, tierResult.id, parsedMpm]
            );
            processed++;
        }

        res.json({ success: true, processed });
    } catch (error) {
        handleError(res, 500, 'Erro ao processar classes em massa', error);
    }
});

app.put('/api/classes/:name', async (req, res) => {
    try {
        const { name, category, tier, mpm = 0 } = req.body;
        const oldName = sanitizeInput(req.params.name);
        const sanitizedName = sanitizeInput(name);
        const sanitizedCategory = sanitizeInput(category);
        const sanitizedTier = sanitizeInput(tier);
        const parsedMpm = parseFloat(mpm);

        if (!sanitizedName || !sanitizedCategory || !sanitizedTier || isNaN(parsedMpm) || parsedMpm < 0) {
            return handleError(res, 400, 'Dados inválidos');
        }

        const [categoryResult] = await executeQuery(
            'SELECT id FROM categories WHERE name = ?', 
            [sanitizedCategory]
        );
        const [tierResult] = await executeQuery(
            'SELECT id FROM tiers WHERE name = ?', 
            [sanitizedTier]
        );

        if (!categoryResult || !tierResult) {
            return handleError(res, 400, 'Categoria ou tier inválido');
        }

        const result = await executeQuery(
            `UPDATE classes 
             SET name = ?, category_id = ?, tier_id = ?, mpm = ?
             WHERE name = ?`,
            [sanitizedName, categoryResult.id, tierResult.id, parsedMpm, oldName]
        );

        if (result.affectedRows === 0) {
            return handleError(res, 404, 'Classe não encontrada');
        }

        res.json({ success: true, message: 'Classe atualizada' });
    } catch (error) {
        handleError(res, 500, 'Erro ao atualizar classe', error);
    }
});

app.delete('/api/classes/:name', async (req, res) => {
    try {
        const name = sanitizeInput(req.params.name);
        const result = await executeQuery('DELETE FROM classes WHERE name = ?', [name]);
        
        if (result.affectedRows === 0) {
            return handleError(res, 404, 'Classe não encontrada');
        }
        
        res.json({ success: true, message: 'Classe removida' });
    } catch (error) {
        handleError(res, 500, 'Erro ao deletar classe', error);
    }
});

app.get('/api/enchantments/:className', async (req, res) => {
    try {
        const className = sanitizeInput(req.params.className);
        const result = await executeQuery(
            'SELECT weapon, class, helm, cape FROM enchantments WHERE class_name = ?',
            [className]
        );

        if (result.length === 0) {
            return res.json({ success: true, data: null });
        }

        res.json({ success: true, data: result[0] });
    } catch (error) {
        handleError(res, 500, 'Erro ao buscar encantamentos', error);
    }
});

app.put('/api/enchantments/:className', async (req, res) => {
    try {
        const className = sanitizeInput(req.params.className);
        const { weapon, class: classEnchant, helm, cape } = req.body;

        const sanitizedWeapon = weapon ? sanitizeInput(weapon) : null;
        const sanitizedClass = classEnchant ? sanitizeInput(classEnchant) : null;
        const sanitizedHelm = helm ? sanitizeInput(helm) : null;
        const sanitizedCape = cape ? sanitizeInput(cape) : null;

        const existing = await executeQuery(
            'SELECT 1 FROM enchantments WHERE class_name = ?',
            [className]
        );

        if (existing.length === 0) {
            await executeQuery(
                'INSERT INTO enchantments (class_name, weapon, class, helm, cape) VALUES (?, ?, ?, ?, ?)',
                [className, sanitizedWeapon || null, sanitizedClass || null, sanitizedHelm || null, sanitizedCape || null]
            );
        } else {
            const updates = [];
            const params = [];
            if (sanitizedWeapon !== null) {
                updates.push('weapon = ?');
                params.push(sanitizedWeapon);
            }
            if (sanitizedClass !== null) {
                updates.push('class = ?');
                params.push(sanitizedClass);
            }
            if (sanitizedHelm !== null) {
                updates.push('helm = ?');
                params.push(sanitizedHelm);
            }
            if (sanitizedCape !== null) {
                updates.push('cape = ?');
                params.push(sanitizedCape);
            }

            if (updates.length === 0) {
                return handleError(res, 400, 'Nenhum dado fornecido para atualização');
            }

            params.push(className);
            const query = `UPDATE enchantments SET ${updates.join(', ')} WHERE class_name = ?`;
            const result = await executeQuery(query, params);

            if (result.affectedRows === 0) {
                return handleError(res, 404, 'Classe não encontrada');
            }
        }

        res.json({ success: true, message: 'Encantamento atualizado' });
    } catch (error) {
        handleError(res, 500, 'Erro ao atualizar encantamento', error);
    }
});

app.post('/api/enchantments', async (req, res) => {
    try {
        const { className, weapon, class: classEnchant, helm, cape } = req.body;

        const sanitizedClassName = sanitizeInput(className);
        const sanitizedWeapon = weapon ? sanitizeInput(weapon) : null;
        const sanitizedClass = classEnchant ? sanitizeInput(classEnchant) : null;
        const sanitizedHelm = helm ? sanitizeInput(helm) : null;
        const sanitizedCape = cape ? sanitizeInput(cape) : null;

        if (!sanitizedClassName) {
            return handleError(res, 400, 'Nome da classe é obrigatório');
        }

        const existing = await executeQuery(
            'SELECT 1 FROM enchantments WHERE class_name = ?',
            [sanitizedClassName]
        );

        if (existing.length > 0) {
            return handleError(res, 400, 'Encantamento já existe para esta classe');
        }

        await executeQuery(
            'INSERT INTO enchantments (class_name, weapon, class, helm, cape) VALUES (?, ?, ?, ?, ?)',
            [sanitizedClassName, sanitizedWeapon, sanitizedClass, sanitizedHelm, sanitizedCape]
        );

        res.status(201).json({ success: true, message: 'Encantamento criado com sucesso' });
    } catch (error) {
        handleError(res, 500, 'Erro ao criar encantamento', error);
    }
});

const handleError = (res, status, message, error = null) => {
    console.error(`${message}:`, error || 'Sem detalhes');
    res.status(status).json({
        success: false,
        message: `${message}. ${error?.message || ''}`
    });
};

process.on('SIGTERM', async () => {
    console.log('🛑 Recebido SIGTERM. Encerrando servidor...');
    await dbPool.end();
    process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => 
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
);