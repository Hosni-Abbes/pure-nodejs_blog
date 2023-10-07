require('dotenv').config();
const http = require('http');
const fs = require('fs');
const qs = require('querystring');
const formidable = require('formidable');
const url = require('url');
const ejs = require('ejs');
const mysql = require('mysql2');

// PORT
const PORT = process.env.PORT || 3000;




// DB Connect
const dbConnect = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'test'
});
dbConnect.connect(err => {
    if(err){
        console.log('Connection to DB failed: '+ err.stack);
        return;
    }
    console.log('Connected to DB as id: '+ dbConnect.threadId);
});




// Server static file
const path = require('path');
const publicDir = path.join(__dirname, 'public');
// Server Static files (css, js)
const serverStaticFile = (filePath, res) => {
    const fileStream = fs.createReadStream(filePath);
    fileStream.on('error', err =>{
        console.log('Cannot read file: '+err);
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('File not found.')
    });
    const fileExtension = path.extname(filePath).toLowerCase();
    const contentType = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.jpg': 'image/jpeg',
        '.png': 'image/png'
    }[fileExtension] || 'application/octet-stream';
    
    res.writeHead(200, {"Content-Type": contentType});
    // Pipe filestream to response
    fileStream.pipe(res)

}

// Read ejs files
const readAndRenderEjsFiles = (file, res, data = [], control='') => {
    fs.readFile(file, 'utf-8', (err, template)=>{
        if(err){
            console.log('Error reading file: '+err);
            res.writeHead(500, {'Content-Type':'text/plain'});
            res.end('Internal server error.');
        }else{
            const renderTemplate = ejs.render(template, {data: data, control: control});
            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(renderTemplate);
        }
    })
}

// DB QUERIES
// Fetch all Posts from DB
const getAllPosts = (file, res, control='') => {
    dbConnect.query('SELECT * FROM `posts`', (err, result)=>{
        if (err){
            console.log('Error in fetching posts');
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Internal server error.');
        }else{
            readAndRenderEjsFiles(file, res, result, control);
        }
    })
}
// Fetch one post
const getOnePostById = (file, id, res, control) => {
     dbConnect.query("SELECT * FROM `posts` WHERE `id` = ?", [id], (err, result) => {
        if(err){
            console.error(err);
            res.writeHead(500, {'Content-Type':'text/plain'});
            res.end('Internal server error');
        }else{
            readAndRenderEjsFiles(file, res, result, control)
        }
     });

 
}
// Create Post
const createPost = async (res, title, desc, imageName) => {
    try{
        await dbConnect.promise().query('INSERT INTO posts (title, description, image) VALUES (?, ?, ?)', [title, desc, imageName]);
            console.log('Post created successfully');
            res.writeHead(302, {'Location': '/dashboard?control=manage-posts'});
            res.end('Post created successfully');
        
    }catch(err){
        console.log('Mysql insert data Error: '+err);
        res.writeHead(500, {'Content-Type':'text/plain'});
        res.end('Internal server error');
    }
}
// Update Post 
const updatePost = async (id, res, title, desc, imageName, imageFullName) => {

    try {
        const nameLength = imageName.split('.').length;
        const imgExt = imageName.split('.')[nameLength-1];
        if( imgExt != '' && imgExt != undefined ){
            deleteFiles(imageFullName, res);
            await dbConnect.promise().query("UPDATE `posts` SET `title`= ?,`description`= ?,`image`= ? WHERE `id` = ? ", [title, desc, imageName, id]);
        }else{
            await dbConnect.promise().query("UPDATE `posts` SET `title`= ?,`description`= ? WHERE `id` = ? ", [title, desc, id]);
        }
        
        console.log('Post updated successfully');
        res.writeHead(302, {'Location': '/dashboard?control=manage-posts'});
        res.end('Post updated successfully');
    }catch(err){
        console.log(err);
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('Internal server error');
    }
}
// Posts sendForm
const sendForm = (req, res, method, id=null) => {
    // Form Images
    const form = new formidable.IncomingForm();
    if (method === 'update'){
        form.options.allowEmptyFiles = true;
        form.options.minFileSize = 0;
    }
    form.parse(req, (err, fields, files)=>{

        if(method === 'create'){
            // if no image redirect
            if (Object.keys(files).length < 1){
                    res.writeHead(302, {'Location': '/'});
                    res.end();
                    return;
            }
        }
        if (err){
            console.log(err);
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Internal server error');
            return;
        }
        // Handle upload files
        let imageName = '';
        if(Object.keys(files).length > 0){
            const uploadDir = './public/uploads/';
            // file Exten
            const fileNameLength = files.image[0].originalFilename.split('.').length;
            const fileExtension = files.image[0].originalFilename.split('.')[fileNameLength-1];
            const newFilePath = uploadDir + files.image[0].newFilename +'.'+ fileExtension;
            imageName = files.image[0].newFilename +'.'+ fileExtension;
            
            fs.rename(files.image[0].filepath, newFilePath, err =>{
                if(err){
                    console.log(err);
                    res.writeHead(500, {'Content-Type': 'text/plain'});
                    res.end('Internal server error');
                    return;
                }
                console.log('File uploaded and moved to uploads');
            });
        }
        
        // Handle other fields
        const title = fields.title;
        const desc = fields.desc;
        const imageFullName = fields.imagename ? fields.imagename : '';
        if(title == '' || desc == ''){
            console.log('Error! Fields are empty.')
            res.writeHead(500, {'Cotent-Type': 'text/plain'});
            res.end('Fields should not be empty');
        }
        if(method === 'create'){
            // create query
            createPost(res, title, desc, imageName);
        }else if(method === 'update'){
            updatePost(id, res, title, desc, imageName, imageFullName);
        }


        
    });
}
// Delete Post
const deletePostById = async (id, res) => {
    try{
        const [imageFullName] = await dbConnect.promise().query("SELECT `image` FROM `posts` WHERE `id` = ?", [id] );

        await dbConnect.promise().query("DELETE FROM `posts` WHERE `id` = ?", [id] );
        deleteFiles(imageFullName[0].image, res);
        // res.writeHead(204);
        // res.end();
        res.writeHead(302, {'Location': '/dashboard?control=manage-posts'});
        res.end();
    }catch (err){
        console.error('Error deleting post.', err);
        res.writeHead(500, {'Content-Type':'text/plain'});
        res.end('Internal server error.');
    }
    
}

// Delete file from uploads folder
const deleteFiles = async (filename, res) => {
    try{
        fs.readdir( path.join(publicDir, '/uploads/'), (err, files)=>{
            if (err){
                console.log(err);
                return;
            }
            files.forEach(file => {
                if (file.includes(filename)){
                    
                    fs.unlink(path.join(publicDir, '/uploads/'+file) , err =>{
                        if(err){
                            throw err;
                        }
                        console.log('File deleted');
                    });
                }
            })
        });
    }catch(err){
        console.log(err);
    }
    return
}


// Create comments
const addComment = (req, res, postId) => {
        if (req.method == 'POST') {
            var body = '';
            req.on('data', data => {
                body += data;    
                // Too much POST data, kill the connection!
                // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
                if (body.length > 1e6)
                    req.connection.destroy();
            });
    
            req.on('end', async () => {
                try {
                    const parsedComment = qs.parse(body);
                    const date = new Date().toISOString().
                        replace(/T/, ' ').
                        replace(/\..+/, '');
                    // Insert comment to DB
                    await dbConnect.promise().query("INSERT INTO `comments` (post_id, comment, created_at) VALUES(?, ?, ?)", [postId, parsedComment.comment, date]);
                    console.log('Comment added successfully');
                    res.writeHead(302, {'Location': `/post/${postId}`});
                    res.end();
                }catch(err){
                    throw err;
                }


            });
        }
    
}

// Create server
const server = http.createServer( async (req, res)=>{
    
    const parseUrl = url.parse(req.url, true);
    
    if(parseUrl.pathname === '/style.css'){
        const cssPath = path.join(publicDir, '/assets/css/style.css');
        serverStaticFile(cssPath, res);
    }else if(parseUrl.pathname === '/main.js'){
        const jsPath = path.join(publicDir, '/assets/js/main.js');
        serverStaticFile(jsPath, res);
    }else if(parseUrl.pathname === '/'){
        getAllPosts('index.ejs', res);
    }else if(parseUrl.pathname.startsWith('/post/')){
        const postId = req.url.split('/post/')[1];
        // fetch post from DB
        try{
            const [rows] = await dbConnect.promise().query('SELECT * FROM posts WHERE id = ?', [postId]);
            const [comments] = await dbConnect.promise().query("SELECT * FROM `comments` WHERE `post_id` = ?", [postId]);
            if(rows.length === 1){
                const post = rows[0];
                // render post view
                const renderTemplate = ejs.renderFile('post.ejs', {post, comments});
                res.writeHead(200, {'Content-Type':'text/html'});
                res.end(await renderTemplate);
            }else{
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.end('Post not found');
            }
        }catch(err){
            console.log('Cant fetch post', err);
            res.writeHead(500, {'Content-Type': 'text/plain'});
            res.end('Internal server error');

        }

    
    }else if(parseUrl.pathname.startsWith('/uploads/')){
        const imagePath = path.join(publicDir, req.url);
        serverStaticFile(imagePath, res);
    }else if(parseUrl.pathname === '/dashboard'){
        const control = parseUrl.query.control;
        getAllPosts('dashboard.ejs', res, control);
        
    }else if (parseUrl.pathname === '/create-post' && req.method === 'POST') {
        // handle form submission
        sendForm(req, res, 'create');
        return
    }else if(parseUrl.pathname === '/get-update-post'){
        const id = parseUrl.query.id;
        getOnePostById('dashboard.ejs', id, res, 'update');
    }else if(parseUrl.pathname.startsWith('/update-post')){
        // handle form submission (Update)
        const id = parseUrl.query.id;

        sendForm(req, res, 'update', id);
        return
    
    }else if(parseUrl.pathname.startsWith('/delete-post')){
        const id = parseUrl.query.id;
        if(id == '' || id == undefined){
            res.writeHead(500, {'Content-Type':'text/plain'});
            res.end('Internal server error');
        }else{
            deletePostById(id, res);
        }
    }else if(parseUrl.pathname.startsWith('/comment/post')  ){
        const postId = parseUrl.query.id;
        addComment(req, res, postId);
    }else{
        readAndRenderEjsFiles('notfound.ejs', res);
    }

});


server.listen(PORT, ()=> console.log('Server is running on port ' + PORT));