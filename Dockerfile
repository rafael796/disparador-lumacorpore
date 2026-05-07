FROM node:20-slim

WORKDIR /app

# Instalar dependências necessárias para o PDFKit (se houver alguma binária, embora o node-slim geralmente baste)
# RUN apt-get update && apt-get install -y ...

COPY package*.json ./

RUN npm install --production

COPY . .

# Criar pastas necessárias e garantir permissões
RUN mkdir -p uploads && chmod 777 uploads

EXPOSE 3000

CMD ["npm", "start"]
