# Ephermal Backend — Deploy Guide

## 1. Server Setup (Hostinger KVM1)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install nginx, certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# Create media directory
sudo mkdir -p /var/www/ephermal/media /var/www/ephermal/public
sudo chown -R $USER:$USER /var/www/ephermal
```

## 2. Clone & Configure

```bash
git clone https://github.com/yourusername/ephermal-backend /var/www/ephermal/backend
cd /var/www/ephermal/backend

cp .env.example .env
nano .env  # Fill in all secrets
```

## 3. Generate Fernet Key

```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Paste result into FERNET_KEY in .env
```

## 4. Start Stack

```bash
docker compose up -d
docker compose logs -f api  # check startup
```

## 5. Run Migrations

```bash
docker compose exec api alembic upgrade head
```

## 6. SSL + Nginx

```bash
sudo cp nginx.conf /etc/nginx/sites-available/ephermal
sudo ln -s /etc/nginx/sites-available/ephermal /etc/nginx/sites-enabled/
sudo certbot --nginx -d ephermal.ai -d www.ephermal.ai
sudo systemctl reload nginx
```

## 7. Deploy Frontend

```bash
cp /path/to/frontend/*.html /var/www/ephermal/public/
```

## 8. Shopify Webhooks

Register in your Shopify Partner app:
- `https://ephermal.ai/api/webhooks/shopify/products` → products/update
- `https://ephermal.ai/api/webhooks/shopify/orders` → orders/create

## 9. Stripe Webhook

Add endpoint in Stripe dashboard:
- URL: `https://ephermal.ai/api/webhooks/stripe`
- Events: `checkout.session.completed`, `customer.subscription.*`

## API Docs (dev only)

`http://localhost:8000/api/docs`
