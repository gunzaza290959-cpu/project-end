const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // allow frontend origins
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nongkhaem_secret_2026';

app.use(cors());
app.use(express.json());

// Ensure data and uploads dirs exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const tempDir = path.join(dataDir, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Serve static uploaded files
app.use('/uploads', express.static(uploadsDir));

// Configure multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage });
const uploadRestore = multer({
    dest: tempDir,
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// Utility functions for storage stats
function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFolderStats(dirPath) {
    let totalSize = 0;
    let fileCount = 0;
    if (fs.existsSync(dirPath)) {
        try {
            const files = fs.readdirSync(dirPath);
            for (const file of files) {
                const filePath = path.join(dirPath, file);
                try {
                    const stat = fs.statSync(filePath);
                    if (stat.isFile()) {
                        totalSize += stat.size;
                        fileCount++;
                    }
                } catch (e) {}
            }
        } catch (e) {}
    }
    return { totalSize, fileCount };
}

// Initialize SQLite database
const dbPath = path.join(dataDir, 'database.sqlite');
let db;

function initDatabase() {
    const database = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("Error opening database " + err.message);
        } else {
            console.log("Connected to the SQLite database.");
            
            // Create Users Table with role
            database.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                role TEXT DEFAULT 'user'
            )`, (err) => {
                if (err) console.error("Error creating users table:", err);
                else {
                    // Migration: Add role column if not exists, then insert default accounts
                    database.run(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`, (alterErr) => {
                        const salt = bcrypt.genSaltSync(10);
                        const adminHash = bcrypt.hashSync('admin123', salt);
                        const userHash = bcrypt.hashSync('user123', salt);

                        database.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['admin', adminHash, 'admin']);
                        database.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES (?, ?, ?)`, ['user', userHash, 'user']);
                    });
                }
            });

            // Create Locations Table
            database.run(`CREATE TABLE IF NOT EXISTS locations (
                id TEXT PRIMARY KEY,
                name TEXT,
                status TEXT,
                lat REAL,
                lng REAL,
                notes TEXT,
                date TEXT,
                imageUrl TEXT
            )`, (err) => {
                if (!err) {
                    // Migration: Add imageUrl to existing table if not exists
                    database.run(`ALTER TABLE locations ADD COLUMN imageUrl TEXT`, () => {});
                }
                if (err) console.error("Error creating locations table:", err);
                else {
                    // Insert mock data if empty
                    database.get("SELECT COUNT(*) as count FROM locations", (err, row) => {
                        if (row && row.count === 0) {
                            const mockData = [
                                { id: "mock-1", name: "สำนักงานเขตหนองแขม", status: "surveyed", lat: 13.705681, lng: 100.358245, notes: "สำนักงานหลัก ประสานงานลงพื้นที่สำรวจเขตหนองแขม", date: "2026-06-01" },
                                { id: "mock-2", name: "วัดหนองแขม", status: "surveyed", lat: 13.693352, lng: 100.342123, notes: "จุดประสานงานชุมชน", date: "2026-06-03" },
                                { id: "mock-3", name: "มหาวิทยาลัยเอเชียอาคเนย์", status: "surveyed", lat: 13.706121, lng: 100.362142, notes: "สำรวจจุดจอดรถ", date: "2026-06-05" },
                                { id: "mock-4", name: "ตลาดศูนย์การค้าหนองแขม", status: "pending", lat: 13.704251, lng: 100.347852, notes: "จุดร้องเรียนขยะอุดตัน", date: "2026-06-12" }
                            ];
                            
                            const stmt = database.prepare("INSERT INTO locations (id, name, status, lat, lng, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?)");
                            mockData.forEach(item => {
                                stmt.run(item.id, item.name, item.status, item.lat, item.lng, item.notes, item.date);
                            });
                            stmt.finalize();
                            console.log("Mock location data inserted.");
                        }
                    });
                }
            });
        }
    });
    return database;
}

db = initDatabase();

// Middleware for JWT Verification
function authenticateToken(req, res, next) {
    // Authentication bypassed to allow anyone to use the system
    next();
}

// ---------------------------------------------------------
// AUTHENTICATION ROUTES
// ---------------------------------------------------------

// Register
app.post('/api/register', async (req, res) => {
    const { username, password, role = 'user' } = req.body;
    if (!username || !password) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const userRole = (role === 'admin' || username.toLowerCase() === 'admin') ? 'admin' : 'user';

        db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username, hashedPassword, userRole], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: "ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว" });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: "สมัครสมาชิกสำเร็จ!" });
        });
    } catch (err) {
        res.status(500).json({ error: "เกิดข้อผิดพลาดบนเซิร์ฟเวอร์" });
    }
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" });

    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: "ไม่พบชื่อผู้ใช้นี้ในระบบ" });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: "รหัสผ่านไม่ถูกต้อง" });

        const userRole = user.role || (user.username === 'admin' ? 'admin' : 'user');

        // Generate JWT Token with role
        const token = jwt.sign({ id: user.id, username: user.username, role: userRole }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ success: true, token, user: { id: user.id, username: user.username, role: userRole } });
    });
});

// Get all users
app.get('/api/users', (req, res) => {
    db.all(`SELECT id, username, role FROM users`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
    });
});

// Update user username & password (Admin operation)
app.post('/api/users/update', async (req, res) => {
    const { userId, targetUsername, newUsername, newPassword, role } = req.body;
    
    // Find user by userId or targetUsername
    const query = userId ? `SELECT * FROM users WHERE id = ?` : `SELECT * FROM users WHERE username = ?`;
    const param = userId || targetUsername;

    if (!param) return res.status(400).json({ error: "กรุณาระบุผู้ใช้งานที่ต้องการแก้ไข" });

    db.get(query, [param], async (err, user) => {
        if (err || !user) return res.status(404).json({ error: "ไม่พบผู้ใช้นี้ในระบบ" });

        try {
            const finalUsername = newUsername && newUsername.trim() !== '' ? newUsername.trim() : user.username;
            const finalRole = role || user.role;

            if (newPassword && newPassword.trim() !== '') {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(newPassword.trim(), salt);
                db.run(`UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?`,
                    [finalUsername, hashedPassword, finalRole, user.id], function(updateErr) {
                        if (updateErr) return res.status(500).json({ error: updateErr.message });
                        res.json({ success: true, message: "อัปเดตชื่อผู้ใช้และรหัสผ่านสำเร็จ!", updatedUser: { id: user.id, username: finalUsername, role: finalRole } });
                    });
            } else {
                db.run(`UPDATE users SET username = ?, role = ? WHERE id = ?`,
                    [finalUsername, finalRole, user.id], function(updateErr) {
                        if (updateErr) return res.status(500).json({ error: updateErr.message });
                        res.json({ success: true, message: "อัปเดตชื่อผู้ใช้สำเร็จ!", updatedUser: { id: user.id, username: finalUsername, role: finalRole } });
                    });
            }
        } catch (e) {
            res.status(500).json({ error: "เกิดข้อผิดพลาดในการอัปเดตข้อมูล" });
        }
    });
});

// ---------------------------------------------------------
// LOCATIONS ROUTES
// ---------------------------------------------------------

// Get all locations (Public or authenticated, leaving public so anyone can view the map, only admins can edit)
app.get('/api/locations', (req, res) => {
    db.all(`SELECT * FROM locations`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Add new location (Protected)
app.post('/api/locations', authenticateToken, (req, res) => {
    const { id, name, status, lat, lng, notes, date, imageUrl } = req.body;
    db.run(`INSERT INTO locations (id, name, status, lat, lng, notes, date, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, status, lat, lng, notes, date, imageUrl],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const newLoc = { id, name, status, lat, lng, notes, date, imageUrl };
            io.emit('locationAdded', newLoc);
            res.json({ success: true, message: "เพิ่มข้อมูลสำเร็จ" });
        }
    );
});

// Update location (Protected)
app.put('/api/locations/:id', authenticateToken, (req, res) => {
    const { name, status, lat, lng, notes, date, imageUrl } = req.body;
    const { id } = req.params;
    
    db.run(`UPDATE locations SET name = ?, status = ?, lat = ?, lng = ?, notes = ?, date = ?, imageUrl = ? WHERE id = ?`,
        [name, status, lat, lng, notes, date, imageUrl, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const updatedLoc = { id, name, status, lat, lng, notes, date, imageUrl };
            io.emit('locationUpdated', updatedLoc);
            res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
        }
    );
});

// Upload image (Protected)
app.post('/api/upload', authenticateToken, upload.single('photo'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ success: true, imageUrl });
});

// Delete location (Protected)
app.delete('/api/locations/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM locations WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('locationDeleted', id);
        res.json({ success: true, message: "ลบข้อมูลสำเร็จ" });
    });
});

// Import multiple locations (Protected)
app.post('/api/locations/import', authenticateToken, (req, res) => {
    const locations = req.body;
    if (!Array.isArray(locations)) return res.status(400).json({ error: "Invalid data format" });

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // Delete old locations to replace with new import
        db.run("DELETE FROM locations");
        
        const stmt = db.prepare("INSERT INTO locations (id, name, status, lat, lng, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?)");
        locations.forEach(item => {
            stmt.run(item.id, item.name, item.status, item.lat, item.lng, item.notes, item.date);
        });
        stmt.finalize();
        
        db.run("COMMIT", (err) => {
            if (err) res.status(500).json({ error: err.message });
            else res.json({ success: true, message: `นำเข้าข้อมูล ${locations.length} จุดสำเร็จ` });
        });
    });
});

// ---------------------------------------------------------
// STORAGE & BACKUP MANAGEMENT ROUTES
// ---------------------------------------------------------

// Get storage and database statistics
app.get('/api/storage/stats', (req, res) => {
    let dbSize = 0;
    let dbModified = null;
    if (fs.existsSync(dbPath)) {
        try {
            const s = fs.statSync(dbPath);
            dbSize = s.size;
            dbModified = s.mtime;
        } catch (e) {}
    }

    const uploadsStats = getFolderStats(uploadsDir);

    db.get(`SELECT 
        COUNT(*) as totalLocations,
        SUM(CASE WHEN status = 'surveyed' THEN 1 ELSE 0 END) as surveyedLocations,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingLocations,
        SUM(CASE WHEN imageUrl IS NOT NULL AND imageUrl != '' THEN 1 ELSE 0 END) as photosLocations
        FROM locations`, [], (err, locRow) => {
        if (err) locRow = {};

        db.get(`SELECT 
            COUNT(*) as totalUsers,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as adminUsers,
            SUM(CASE WHEN role != 'admin' OR role IS NULL THEN 1 ELSE 0 END) as normalUsers
            FROM users`, [], (uErr, userRow) => {
            if (uErr) userRow = {};

            res.json({
                success: true,
                database: {
                    type: "SQLite 3",
                    filename: "database.sqlite",
                    size: dbSize,
                    formattedSize: formatBytes(dbSize),
                    lastModified: dbModified,
                    status: "Connected"
                },
                uploads: {
                    count: uploadsStats.fileCount,
                    size: uploadsStats.totalSize,
                    formattedSize: formatBytes(uploadsStats.totalSize)
                },
                records: {
                    totalLocations: locRow?.totalLocations || 0,
                    surveyed: locRow?.surveyedLocations || 0,
                    pending: locRow?.pendingLocations || 0,
                    withPhotos: locRow?.photosLocations || 0,
                    totalUsers: userRow?.totalUsers || 0,
                    adminUsers: userRow?.adminUsers || 0,
                    normalUsers: userRow?.normalUsers || 0
                },
                server: {
                    uptimeSeconds: Math.floor(process.uptime()),
                    platform: process.platform,
                    nodeVersion: process.version,
                    timestamp: new Date().toISOString()
                }
            });
        });
    });
});

// Download full SQLite database backup file
app.get('/api/storage/backup/sqlite', (req, res) => {
    if (!fs.existsSync(dbPath)) {
        return res.status(404).json({ error: "ไม่พบไฟล์ฐานข้อมูล SQLite" });
    }
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `nongkhaem_backup_${dateStr}.sqlite`;
    res.download(dbPath, filename);
});

// Download JSON backup
app.get('/api/storage/backup/json', (req, res) => {
    db.all(`SELECT * FROM locations`, [], (lErr, locations) => {
        if (lErr) return res.status(500).json({ error: lErr.message });
        db.all(`SELECT id, username, role FROM users`, [], (uErr, users) => {
            if (uErr) return res.status(500).json({ error: uErr.message });
            const backupData = {
                metadata: {
                    appName: "ระบบแผนที่และสารสนเทศลงพื้นที่สำรวจ เขตหนองแขม",
                    exportDate: new Date().toISOString(),
                    databaseType: "SQLite",
                    version: "2.0"
                },
                summary: {
                    totalLocations: locations.length,
                    totalUsers: users.length
                },
                locations: locations,
                users: users
            };
            const dateStr = new Date().toISOString().slice(0, 10);
            const filename = `nongkhaem_backup_${dateStr}.json`;
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.send(JSON.stringify(backupData, null, 2));
        });
    });
});

// Restore database from SQLite file
app.post('/api/storage/restore/sqlite', authenticateToken, uploadRestore.single('databaseFile'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "กรุณาเลือกไฟล์ .sqlite เพื่อกู้คืน" });
    const tempFilePath = req.file.path;

    try {
        // Verify SQLite format header
        const buffer = Buffer.alloc(16);
        const fd = fs.openSync(tempFilePath, 'r');
        fs.readSync(fd, buffer, 0, 16, 0);
        fs.closeSync(fd);

        const header = buffer.toString('utf8', 0, 15);
        if (header !== 'SQLite format 3') {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return res.status(400).json({ error: "ไฟล์ที่อัปโหลดไม่ใช่ฐานข้อมูล SQLite ที่ถูกต้อง" });
        }

        // Backup current database
        if (fs.existsSync(dbPath)) {
            try { fs.copyFileSync(dbPath, dbPath + '.bak'); } catch (e) {}
        }

        // Close current DB and replace
        db.close((closeErr) => {
            if (closeErr) console.warn("Error closing old DB connection:", closeErr);

            try {
                fs.copyFileSync(tempFilePath, dbPath);
                if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

                db = initDatabase();
                io.emit('databaseRestored', { message: 'Database restored successfully', timestamp: Date.now() });

                res.json({ success: true, message: "กู้คืนฐานข้อมูล SQLite สำเร็จเรียบร้อยแล้ว!" });
            } catch (copyErr) {
                if (fs.existsSync(dbPath + '.bak')) {
                    try { fs.copyFileSync(dbPath + '.bak', dbPath); } catch (e) {}
                }
                db = initDatabase();
                res.status(500).json({ error: "เกิดข้อผิดพลาดในการกู้คืนไฟล์ฐานข้อมูล: " + copyErr.message });
            }
        });
    } catch (err) {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        res.status(500).json({ error: "การตรวจสอบไฟล์ล้มเหลว: " + err.message });
    }
});

// Restore database from JSON
app.post('/api/storage/restore/json', authenticateToken, (req, res) => {
    let data = req.body;
    let locations = Array.isArray(data) ? data : data.locations;

    if (!Array.isArray(locations)) {
        return res.status(400).json({ error: "รูปแบบไฟล์ JSON ไม่ถูกต้อง ไม่พบข้อมูลจุดสำรวจ (locations)" });
    }

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM locations");
        const stmt = db.prepare("INSERT INTO locations (id, name, status, lat, lng, notes, date, imageUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        locations.forEach(item => {
            stmt.run(
                item.id || ('loc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
                item.name || 'ไม่มีชื่อ',
                item.status || 'pending',
                item.lat || 0,
                item.lng || 0,
                item.notes || '',
                item.date || new Date().toISOString().slice(0, 10),
                item.imageUrl || null
            );
        });
        stmt.finalize();

        db.run("COMMIT", (err) => {
            if (err) {
                return res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + err.message });
            }
            io.emit('databaseRestored', { message: 'Data imported', timestamp: Date.now() });
            res.json({ success: true, message: `กู้คืนข้อมูลสำเร็จ ${locations.length} จุดสำรวจ!` });
        });
    });
});

// Clean up unused/orphaned photos from uploads directory
app.post('/api/storage/clean-uploads', authenticateToken, (req, res) => {
    db.all("SELECT imageUrl FROM locations WHERE imageUrl IS NOT NULL AND imageUrl != ''", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        const usedFileNames = new Set(rows.map(r => path.basename(r.imageUrl)));
        let deletedFilesCount = 0;
        let freedBytes = 0;

        if (fs.existsSync(uploadsDir)) {
            try {
                const files = fs.readdirSync(uploadsDir);
                for (const file of files) {
                    if (!usedFileNames.has(file)) {
                        const fullPath = path.join(uploadsDir, file);
                        try {
                            const s = fs.statSync(fullPath);
                            if (s.isFile()) {
                                freedBytes += s.size;
                                fs.unlinkSync(fullPath);
                                deletedFilesCount++;
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }

        res.json({
            success: true,
            message: `ล้างไฟล์รูปภาพที่ไม่ถูกอ้างอิงสำเร็จ (${deletedFilesCount} ไฟล์, คืนพื้นที่ ${formatBytes(freedBytes)})`,
            deletedCount: deletedFilesCount,
            freedFormatted: formatBytes(freedBytes)
        });
    });
});

// Search Locations (Google Maps or Nominatim Fallback)
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.json([]);

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    try {
        if (googleApiKey) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${googleApiKey}&language=th`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results) {
                const mappedResults = data.results.slice(0, 5).map(item => ({
                    display_name: item.formatted_address,
                    name: item.formatted_address.split(' ')[0], // usually the house number or first part
                    lat: item.geometry.location.lat,
                    lon: item.geometry.location.lng,
                    source: 'google-geocode'
                }));
                return res.json(mappedResults);
            }
            return res.json([]);
        } else {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=th,en`;
            const response = await fetch(url, { headers: { 'User-Agent': 'NongKhaemSurveyApp/1.0' }});
            const data = await response.json();
            const mappedResults = data.map(item => ({
                display_name: item.display_name,
                name: item.display_name.split(',')[0],
                lat: parseFloat(item.lat),
                lon: parseFloat(item.lon),
                source: 'osm'
            }));
            return res.json(mappedResults);
        }
    } catch (err) {
        console.error("Search error:", err);
        res.status(500).json({ error: "Failed to search locations" });
    }
});

// Reverse Geocoding (Google Maps or Nominatim Fallback)
app.get('/api/geocode', async (req, res) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "Missing lat/lng" });

    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    try {
        if (googleApiKey) {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}&language=th`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results && data.results.length > 0) {
                // Get the most specific address (usually the first one)
                return res.json({ address: data.results[0].formatted_address, source: 'google' });
            }
            return res.json({ address: "ไม่พบที่อยู่", source: 'google' });
        } else {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=th,en`;
            const response = await fetch(url, { headers: { 'User-Agent': 'NongKhaemSurveyApp/1.0' }});
            const data = await response.json();
            
            if (data && data.display_name) {
                return res.json({ address: data.display_name, source: 'osm' });
            }
            return res.json({ address: "ไม่พบที่อยู่", source: 'osm' });
        }
    } catch (err) {
        console.error("Geocode error:", err);
        res.status(500).json({ error: "Failed to geocode location" });
    }
});

// ---------------------------------------------------------
// SERVE FRONTEND (PRODUCTION)
// ---------------------------------------------------------
// Serve static files from the Vite build directory
const frontendPath = path.join(__dirname, '../phanvadee-data-entry/dist');
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    
    // Catch-all route to serve index.html for React Router
    app.use((req, res) => {
        res.sendFile(path.join(frontendPath, 'index.html'));
    });
} else {
    console.log("Frontend build not found. API only mode.");
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT} with WebSocket`);
});
