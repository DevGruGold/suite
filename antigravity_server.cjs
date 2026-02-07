
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.ANTIGRAVITY_TOKEN || 'default-dev-token';

app.use(cors());
app.use(bodyParser.json());

// Middleware for simple token authentication
const authenticate = (req, res, next) => {
    const token = req.headers['x-antigravity-token'];
    if (!token || token !== AUTH_TOKEN) {
        console.log(`🚫 Unauthorized access attempt from ${req.ip}`);
        return res.status(403).json({ error: 'Unauthorized', message: 'Invalid or missing token' });
    }
    next();
};

// Auto-clean old tasks on startup
const TASKS_FILE = path.join(__dirname, 'local_tasks.json');
if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify([], null, 2));
}

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'active', platform: process.platform, timestamp: new Date().toISOString() });
});

app.post('/task', authenticate, (req, res) => {
    const task = req.body;

    if (!task || !task.title) {
        return res.status(400).json({ error: 'Invalid Task', message: 'Task must have a title' });
    }

    console.log(`\n📨 RECEIVED TASK: "${task.title}"`);
    console.log(`   Description: ${task.description || 'No description'}`);
    console.log(`   From: ${task.source || 'Eliza'}`);

    // Read existing tasks
    let tasks = [];
    try {
        if (fs.existsSync(TASKS_FILE)) {
            const data = fs.readFileSync(TASKS_FILE, 'utf8');
            tasks = JSON.parse(data);
        }
    } catch (e) {
        console.error('Error reading tasks file:', e);
        tasks = [];
    }

    // Add new task with metadata
    const newTask = {
        id: `task-${Date.now()}`,
        ...task,
        received_at: new Date().toISOString(),
        status: 'pending'
    };

    tasks.push(newTask);

    // Save back to file
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));

    console.log(`✅ Task saved to ${TASKS_FILE}`);

    res.json({
        success: true,
        message: 'Task received and logged locally',
        task_id: newTask.id
    });
});

app.post('/command', authenticate, (req, res) => {
    const { command } = req.body;

    if (!command) {
        return res.status(400).json({ error: 'Missing Command', message: 'Body must include "command" field' });
    }

    // Security warning - in production this needs strict allowlisting
    console.log(`\n⚠️ REMOTE COMMAND RECEIVED: ${command}`);

    const { exec } = require('child_process');
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error executing command: ${error.message}`);
            return res.status(500).json({ success: false, error: error.message, stderr });
        }
        console.log(`Command output: ${stdout}`);
        res.json({ success: true, stdout, stderr });
    });
});

app.listen(PORT, () => {
    console.log(`\n🚀 ANTIGRAVITY BRIDGE SERVER RUNNING`);
    console.log(`   Local URL: http://localhost:${PORT}`);
    console.log(`   Auth Token: ${AUTH_TOKEN}`);
    console.log(`   Ready to receive tasks from Eliza via ngrok...\n`);
});
