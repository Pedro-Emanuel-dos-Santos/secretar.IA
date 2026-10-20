const {defineConfig}=require('prisma/config');
const url=process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
module.exports=defineConfig({schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations'},...(url?{datasource:{url}}:{})});
