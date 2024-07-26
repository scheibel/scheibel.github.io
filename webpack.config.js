'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const webpack = require('webpack');
const PugPlugin = require('pug-plugin');
const CompressionPlugin = require('compression-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const FontminPlugin = require('fontmin-webpack');

const Bibliography = require('bibliography');
const StringValue = require('bibliography/internal/bibtex/field_value/StringValue').default;

const { toNamespacedPath } = require('path');
const yaml = require('yaml');

const renderAuthors = (authorField) => {
    const names = authorField._authors.map((authorName, index) => {
        var parts = [];
        parts.push(authorName.firstNames.join(" "));
        if (authorName.vons.length > 0) {
            parts.push(authorName.vons.join(" "));
        }
        parts.push(authorName.lastNames.join(" "));
        if (authorName.jrs.length > 0) {
            parts.push(authorName.jrs.join(" "));
        }
        return parts.join(" ");
    });
    if (names.length > 10) {
        names.length = 10;
        names.push("et al.");
    } else if (names.length > 2) {
        names[names.length-1] = "and "+names[names.length-1];
    }
    return names.join(", ");
}

const renderPages = (pagesField) => {
    return "0&endash;0";
}

const augmentBibliographyEntry = (entry) => {
    const augmentedEntry = Object.assign({}, entry);
    if (augmentedEntry.fields.author) {
        augmentedEntry.author = renderAuthors(augmentedEntry.fields.author);
    }
    if (augmentedEntry.fields.title) {
        augmentedEntry.title = augmentedEntry.fields.title._unicode;
    }
    if (augmentedEntry.fields.journal) {
        augmentedEntry.journal = augmentedEntry.fields.journal._unicode;
    }
    if (augmentedEntry.fields.year) {
        augmentedEntry.year = augmentedEntry.fields.year._unicode;
    }
    if (augmentedEntry.fields.doi) {
        augmentedEntry.doi = augmentedEntry.fields.doi._unicode;
    }
    if (augmentedEntry.fields.publisher) {
        augmentedEntry.publisher = augmentedEntry.fields.publisher._unicode;
    }
    if (augmentedEntry.fields.note) {
        augmentedEntry.note = augmentedEntry.fields.note._unicode;
    }
    if (augmentedEntry.fields.pages) {
        augmentedEntry.pages = renderPages(augmentedEntry.fields.pages);
    }
    
    if (augmentedEntry.fields.url) {
        augmentedEntry.url = augmentedEntry.fields.url._unicode;
    }

    // console.log(augmentedEntry);
    return augmentedEntry;
}

const compileBibEntry = (bibEntry, ignoredFields) => {
    let result = '@'+bibEntry['@type'] + '{' + bibEntry._id + ',\n';

    for (const fieldName of Object.keys(bibEntry.fields)) {
        if (ignoredFields.indexOf(fieldName) >= 0) {
            continue;
        }

        const fieldValue = new StringValue(bibEntry.fields[fieldName])._unicode;
        
        result += '    ' + fieldName + ' = {' + fieldValue + '},\n';
    }

    result += '}\n';

    return result;
}

const createBibliographyFromBibFilesSync = (filenames) => {
    const entries = {};
    filenames.forEach((filename) => {
        const entry = fs.readFileSync(filename, 'utf8');
        const relativeFilename = path.relative(path.join(__dirname, 'content'), filename);
        const parsed_path = path.parse(relativeFilename);
        const path_elements = parsed_path.dir.split('/');
        path_elements.push(parsed_path.name);
        path_elements.shift();
        const key = path_elements.join("/");
        const parsed = Bibliography.parseString(entry);

        const bibliographyRawEntry = parsed.rawEntries[Object.keys(parsed.rawEntries)[0]];
        const bibliographyEntry = parsed.entries[Object.keys(parsed.entries)[0]];

        entries[key] = {
            key: key,
            filename: relativeFilename,
            content: compileBibEntry(bibliographyRawEntry, [ 'url' ]),
            parsedContent: augmentBibliographyEntry(bibliographyEntry),
        };
    });
    return entries;
}

const collectNewsSync = (filenames) => {
    const entries = {};
    filenames.forEach((filename) => {
        const entry = fs.readFileSync(filename, 'utf8');
        const key = path.basename(filename, '.json');
        entries[key] = JSON.parse(entry);
    });
    return entries;
}

const getYAMLDictSync = (filename) => {
    const data = fs.readFileSync(`./content/data/${filename}`, 'utf8');
    return yaml.parse(data);
}

function code(char) {
    return char.charCodeAt();
}

function charRange(s, e) {
    return String.fromCharCode(...[...Array(e - s + 1)].map((_, i) => i + s));
}

function chars() {
    const num = charRange(code('0'), code('9'));
    const lower = charRange(code('a'), code('z'));
    const upper = charRange(code('A'), code('Z'));
    const other = ' #&\'()+,-./:?@[]';
    return [num, lower, upper, other];
}

module.exports = function (env, argv) {

    const entries = {};

    const pugFiles = glob.sync(path.join(__dirname, 'content/', '**/*.pug'));

    pugFiles.forEach((pugFile) => {
        const filename = path.relative(path.join(__dirname, 'content'), pugFile);
        const key = path.join(path.dirname(filename), path.basename(filename, '.pug'));
        entries[key] = pugFile;
    });

    const bibFiles = glob.sync(path.join(__dirname, 'content/publications/', '**/*.bib'));
    const newsFiles = glob.sync(path.join(__dirname, 'content/news/', '**/*.json'));

    const data = {
        context: getYAMLDictSync('context.yml'),
        news: collectNewsSync(newsFiles),
        bibliography: createBibliographyFromBibFilesSync(bibFiles)
    };

    return {
        output: {
            path: path.resolve(__dirname, 'dist'),
            clean: true
        },
        entry: entries,
        plugins: [
            new PugPlugin(),
            new FontminPlugin({
                glyphs: chars()
            }),
            new CompressionPlugin({
                minRatio: 0.9
            }),
        ],
        resolve: {
            alias: {
                "@root": path.join(__dirname, 'content/'),
            },
        },
        module: {
            rules: [
                {
                    test: /\.pug$/,
                    use: {
                        loader: PugPlugin.loader,
                        options: { data: data, basedir: __dirname }
                    }
                },
                {
                    test: /\.css$/,
                    use: [
                        { loader: 'css-loader', options: { import: false } },
                        { loader: 'css-import-loader' },
                    ]
                },
                {
                    test: /\.scss$/,
                    use: [
                        { loader: 'css-loader', options: { import: false } },
                        { loader: 'sass-loader' },
                        { loader: 'css-import-loader' },
                    ]
                },
                {
                    test: /\.(eot|otf|ttf|woff|woff2)$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'fonts/[name][ext][query]'
                    }
                },
                {
                    test: /\.asc$/,
                    type: 'asset/resource',
                    generator: {
                        filename: '[name][ext][query]'
                    }
                },
                {
                    test: /\.(png|jpg|jpeg)$/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'images/[name][ext][query]'
                    }
                },
                {
                    test: /\.bib$/,
                    type: 'asset/resource',
                    use: [
                        { loader: path.resolve(__dirname, 'bib-loader.js'), options: { ignoredFields: [ 'url' ] } }
                    ],
                    generator: {
                        filename: 'publications/[name][ext][query]'
                    }
                }
            ],
        },
        optimization: {
            minimize: true,
            minimizer: [
                `...`,
                new CssMinimizerPlugin(),
            ],
        },
        devServer: {
            hot: false
        }
    };
}
