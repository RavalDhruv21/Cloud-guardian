function handler(event) {
    var request = event.request;
    var uri = request.uri;

    // Root path → serve index.html
    if (uri === '/' || uri === '') {
        request.uri = '/index.html';
        return request;
    }

    // Remove trailing slash and redirect to .html
    // e.g., /auth/callback/ → /auth/callback.html
    if (uri.endsWith('/')) {
        request.uri = uri.slice(0, -1) + '.html';
        return request;
    }

    // If the URI has no file extension, append .html
    // e.g., /auth/callback → /auth/callback.html
    // This is the critical fix: S3 won't redirect anymore,
    // it will directly serve auth/callback.html
    var lastSegment = uri.split('/').pop();
    if (lastSegment && lastSegment.indexOf('.') === -1) {
        request.uri = uri + '.html';
    }

    return request;
}