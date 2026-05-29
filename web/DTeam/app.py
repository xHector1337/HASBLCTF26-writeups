import os
import sqlite3
import uuid

from flask import Flask, request, render_template, redirect, url_for, session, render_template_string, make_response, jsonify
from markupsafe import Markup
from weasyprint import HTML

app = Flask(__name__)
app.secret_key = os.urandom(24)

DATABASE = 'dteam.db'

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db = get_db()
    db.execute('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, password TEXT, balance REAL DEFAULT 0.0, promo_used INTEGER DEFAULT 0, gift_code TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT)')
    db.execute('CREATE TABLE IF NOT EXISTS games (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, price REAL)')
    db.execute('CREATE TABLE IF NOT EXISTS purchases (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, game_id INTEGER, UNIQUE(user_id, game_id))')

    columns = [row['name'] for row in db.execute('PRAGMA table_info(users)')]
    if 'gift_code' not in columns:
        db.execute('ALTER TABLE users ADD COLUMN gift_code TEXT')
    
    db.execute('DELETE FROM games')
    games_list = [
        ("Grand The Auto 7", 599.99),
        ("Red Deep Redemption 3", 450.00),
        ("Cyber-Bug 2026: Hotfix", 29.99),
        ("Elden Necklace", 399.99),
        ("League of Noobs", 0.00),
        ("RuneDelta: Chapter 8", 15.00),
        ("Resident Good 10", 19.99),
        ("The First of Us", 69.99),
        ("Minecraf 2", 25.00)
    ]
    db.executemany('INSERT INTO games (name, price) VALUES (?, ?)', games_list)
    db.commit()

@app.context_processor
def inject_user():
    if 'user_id' in session:
        db = get_db()
        user = db.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        return dict(current_user=user)
    return dict(current_user=None)

@app.route('/')
def index():
    db = get_db()
    games = db.execute('SELECT * FROM games').fetchall()
    purchased_ids = set()
    if 'user_id' in session:
        rows = db.execute('SELECT game_id FROM purchases WHERE user_id = ?', (session['user_id'],)).fetchall()
        purchased_ids = {row['game_id'] for row in rows}
    return render_template('index.html', games=games, purchased_ids=purchased_ids)

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if not username or not password or len(username) < 6 or len(password) < 6:
            return jsonify({"success": False, "msg": "Username and Password must be at least 6 characters!"}), 400
        if len(username) > 30:
            return jsonify({"success": False, "msg": "Username too long! Max 30 chars."}), 400
        db = get_db()
        gift_code = f"DTEAM-{str(uuid.uuid4())[:8].upper()}"
        cursor = db.execute('INSERT INTO users (username, password, gift_code) VALUES (?, ?, ?)', (username, password, gift_code))
        user_id = cursor.lastrowid
        db.execute('INSERT INTO messages (user_id, content) VALUES (?, ?)', (user_id, f"Welcome to DTeam! Your gift code: {gift_code}"))
        db.commit()
        return jsonify({"success": True})
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        db = get_db()
        user = db.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password)).fetchone()
        if user:
            session['user_id'] = user['id']
            return jsonify({"success": True})
        return jsonify({"success": False, "msg": "Invalid username or password!"}), 401
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/messages')
def messages():
    if 'user_id' not in session: return redirect(url_for('login'))
    db = get_db()
    msgs = db.execute('SELECT content FROM messages WHERE user_id = ?', (session['user_id'],)).fetchall()
    return render_template('messages.html', msgs=msgs)

@app.route('/codes', methods=['GET', 'POST'])
def codes():
    if 'user_id' not in session: return redirect(url_for('login'))
    if request.method == 'POST':
        code = request.form.get('code')
        db = get_db()
        user = db.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
        if code and code == user['gift_code'] and user['promo_used'] == 0:
            db.execute('UPDATE users SET balance = balance + 20, promo_used = 1 WHERE id = ?', (session['user_id'],))
            db.commit()
            return redirect(url_for('index'))
    return render_template('codes.html')

@app.route('/cart')
def cart():
    if 'user_id' not in session: return redirect(url_for('login'))
    db = get_db()
    items = []
    total = 0
    if 'cart' in session:
        for gid in session['cart']:
            game = db.execute('SELECT * FROM games WHERE id = ?', (gid,)).fetchone()
            if game:
                items.append(game)
                total += game['price']
    return render_template('cart.html', items=items, total=total)

@app.route('/cart/add/<int:game_id>')
def add_to_cart(game_id):
    if 'user_id' in session:
        db = get_db()
        exists = db.execute('SELECT 1 FROM purchases WHERE user_id = ? AND game_id = ?', (session['user_id'], game_id)).fetchone()
        if exists:
            return redirect(url_for('index'))
    if 'cart' not in session: session['cart'] = []
    session['cart'].append(game_id)
    session.modified = True
    return redirect(url_for('cart'))

@app.route('/cart/remove/<int:game_id>')
def remove_from_cart(game_id):
    if 'cart' in session:
        try:
            session['cart'].remove(game_id)
            session.modified = True
        except ValueError:
            pass
    return redirect(url_for('cart'))

@app.route('/checkout', methods=['POST'])
def checkout():
    if 'user_id' not in session: return jsonify({"success": False}), 403
    db = get_db()
    user = db.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    total = 0
    purchased_items = []
    purchased_ids = []
    if 'cart' in session:
        for gid in session['cart']:
            g = db.execute('SELECT id, name, price FROM games WHERE id = ?', (gid,)).fetchone()
            total += g['price']
            purchased_items.append({"name": g['name'], "price": g['price']})
            purchased_ids.append(g['id'])
    if purchased_items and user['balance'] >= total:
        db.execute('UPDATE users SET balance = balance - ? WHERE id = ?', (total, session['user_id']))
        db.executemany('INSERT OR IGNORE INTO purchases (user_id, game_id) VALUES (?, ?)', [(session['user_id'], gid) for gid in purchased_ids])
        db.commit()
        session['last_order'] = purchased_items
        session['last_total'] = total
        session.pop('cart', None)
        return jsonify({"success": True})
    return jsonify({"success": False, "msg": "Insufficient funds!"})

@app.route('/success')
def success():
    return render_template('success.html')

@app.route('/download_invoice')
def download_invoice():
    if 'user_id' not in session: return redirect(url_for('login'))
    db = get_db()
    user = db.execute('SELECT username FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    
    order_items = session.get('last_order', [{"name": "Digital License", "price": 0.0}])
    order_total = session.get('last_total', 0.0)
    
    items_html = "".join([
        f"<tr>"
        f"<td style='padding:12px; border-bottom:1px solid #2a475e;'>{item['name']}</td>"
        f"<td style='padding:12px; border-bottom:1px solid #2a475e; text-align:center;'>Digital</td>"
        f"<td style='padding:12px; border-bottom:1px solid #2a475e; text-align:right;'>${item['price']:.2f}</td>"
        f"</tr>" 
        for item in order_items
    ])

    invoice_template = f"""
    <html>
        <head>
            <style>
                @page {{ size: A4; margin: 0; }}
                body {{ font-family: 'Helvetica', sans-serif; background-color: #1b2838; color: #c7d5e0; margin: 0; padding: 0; }}
                .header {{ background-color: #171a21; padding: 40px; text-align: center; border-bottom: 4px solid #66c0f4; }}
                .container {{ padding: 40px; }}
                .invoice-box {{ background-color: #171a21; border: 1px solid #2a475e; border-radius: 4px; overflow: hidden; }}
                table {{ width: 100%; border-collapse: collapse; }}
                th {{ background-color: #2a475e; color: #66c0f4; padding: 12px; text-align: left; text-transform: uppercase; font-size: 13px; }}
                .total-row {{ font-size: 22px; color: #ffffff; text-align: right; padding: 20px; background-color: #21323d; }}
                .footer {{ text-align: center; margin-top: 40px; color: #4f5359; font-size: 11px; letter-spacing: 1px; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1 style="color: #ffffff; margin: 0; font-size: 35px;">DTEAM PURCHASE RECEIPT</h1>
                <p style="color: #66c0f4; margin-top: 10px;">ID: #{os.urandom(4).hex().upper()}</p>
            </div>
            <div class="container">
                <div style="margin-bottom: 25px;">
                    <p><strong>Customer Account:</strong> {user['username']}</p>
                    <p><strong>Billing Status:</strong> COMPLETED</p>
                    <p><strong>Transaction Date:</strong> 2026-05-06</p>
                </div>
                <div class="invoice-box">
                    <table>
                        <thead>
                            <tr>
                                <th>Item Description</th>
                                <th style="text-align:center;">Type</th>
                                <th style="text-align:right;">Price</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items_html}
                        </tbody>
                    </table>
                    <div class="total-row">
                        <span style="color: #66c0f4; font-size: 16px;">TOTAL PAID:</span> ${order_total:.2f}
                    </div>
                </div>
                <div class="footer">
                    <p>DTEAM GLOBAL ASSETS LTD. - NO PHYSICAL SIGNATURE REQUIRED</p>
                </div>
            </div>
        </body>
    </html>
    """
    
    step1 = render_template_string(invoice_template)
    step2 = render_template_string(Markup(step1).unescape()) 
    
    pdf = HTML(string=step2).write_pdf()
    response = make_response(pdf)
    response.headers['Content-Type'] = 'application/pdf'
    response.headers['Content-Disposition'] = 'attachment; filename=DTeam_Invoice.pdf'
    return response

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=5000)
