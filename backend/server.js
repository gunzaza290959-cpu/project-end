const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening database " + err.message);
    } else {
        console.log("Connected to the SQLite database.");
        
        // Create Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )`, (err) => {
            if (err) console.error("Error creating users table:", err);
            else {
                // Insert default admin user if not exists
                const salt = bcrypt.genSaltSync(10);
                const hash = bcrypt.hashSync('admin123', salt);
                db.run(`INSERT OR IGNORE INTO users (username, password) VALUES (?, ?)`, ['admin', hash]);
            }
        });

        // Create Locations Table
        db.run(`CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY,
            name TEXT,
            status TEXT,
            lat REAL,
            lng REAL,
            notes TEXT,
            date TEXT
        )`, (err) => {
            if (err) console.error("Error creating locations table:", err);
            else {
                // Insert mock data if empty
                db.get("SELECT COUNT(*) as count FROM locations", (err, row) => {
                    if (row && row.count === 0) {
                        const mockData = [
                            { id: "mock-1", name: "สำนักงานเขตหนองแขม", status: "surveyed", lat: 13.705681, lng: 100.358245, notes: "สำนักงานหลัก ประสานงานลงพื้นที่สำรวจเขตหนองแขม", date: "2026-06-01" },
                            { id: "mock-2", name: "วัดหนองแขม", status: "surveyed", lat: 13.693352, lng: 100.342123, notes: "จุดประสานงานชุมชน", date: "2026-06-03" },
                            { id: "mock-3", name: "มหาวิทยาลัยเอเชียอาคเนย์", status: "surveyed", lat: 13.706121, lng: 100.362142, notes: "สำรวจจุดจอดรถ", date: "2026-06-05" },
                            { id: "mock-4", name: "ตลาดศูนย์การค้าหนองแขม", status: "pending", lat: 13.704251, lng: 100.347852, notes: "จุดร้องเรียนขยะอุดตัน", date: "2026-06-12" }
                        ];
                        
                        const stmt = db.prepare("INSERT INTO locations (id, name, status, lat, lng, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?)");
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

// ---------------------------------------------------------
// AUTHENTICATION ROUTES
// ---------------------------------------------------------

// Register
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: "กรุณากรอกข้อมูลให้ครบถ้วน" });

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: "ชื่อผู้ใช้นี้มีอยู่ในระบบแล้ว" });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: "สมัครสมาชิกสำเร็จ!", userId: this.lastID });
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

        // In a real app, you would issue a JWT token here.
        // For simplicity, we just return success and user info.
        res.json({ success: true, user: { id: user.id, username: user.username } });
    });
});

// ---------------------------------------------------------
// LOCATIONS ROUTES
// ---------------------------------------------------------

// Get all locations
app.get('/api/locations', (req, res) => {
    db.all(`SELECT * FROM locations`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Add new location
app.post('/api/locations', (req, res) => {
    const { id, name, status, lat, lng, notes, date } = req.body;
    db.run(`INSERT INTO locations (id, name, status, lat, lng, notes, date) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, name, status, lat, lng, notes, date],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "เพิ่มข้อมูลสำเร็จ" });
        }
    );
});

// Update location
app.put('/api/locations/:id', (req, res) => {
    const { name, status, lat, lng, notes, date } = req.body;
    const { id } = req.params;
    
    db.run(`UPDATE locations SET name = ?, status = ?, lat = ?, lng = ?, notes = ?, date = ? WHERE id = ?`,
        [name, status, lat, lng, notes, date, id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "อัปเดตข้อมูลสำเร็จ" });
        }
    );
});

// Delete location
app.delete('/api/locations/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM locations WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "ลบข้อมูลสำเร็จ" });
    });
});

// Import multiple locations
app.post('/api/locations/import', (req, res) => {
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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
