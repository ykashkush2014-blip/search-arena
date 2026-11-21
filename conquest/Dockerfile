# CONQUEST — صورة Fly.io الجاهزة.
#
# اللعبة بلا أي تبعيات خارجية (zero-dependency)، لذلك الصورة صغيرة جدًا:
# لا npm install ولا node_modules، فقط Node نفسه + ملفات اللعبة.
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

# ملفات اللعبة فقط (انظر .dockerignore) — الخادم يقدّم الصفحة والملفات بنفسه.
COPY . .

# نعمل كمستخدم غير جذري (متطلب أمني من Fly اختياريًا، وممارسة جيدة).
USER node

EXPOSE 8080

# فحص صحة بسيط: /health يعيد {"ok":true,...}
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
