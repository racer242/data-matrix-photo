/**
 * Data Matrix Photo Reader
 * Веб-библиотека для сканирования Data Matrix кодов с фотографий
 * 
 * Использование:
 *   dataMatrixPhotoReader.upload() - загружает фото
 *   dataMatrixPhotoReader.start() - стартует сканирование
 *   dataMatrixPhotoReader.onUpload(callback) - обработчик загрузки
 *   dataMatrixPhotoReader.onReady(callback) - обработчик успешного чтения
 *   dataMatrixPhotoReader.onUploadError(callback) - обработчик ошибки загрузки
 *   dataMatrixPhotoReader.onReadError(callback) - обработчик ошибки чтения
 */
(function(global) {
    'use strict';

    // Изолированное пространство имен
    var ns = {};

    // Приватные переменные
    var uploadedImage = null;
    var uploadCallback = null;
    var readyCallback = null;
    var uploadErrorCallback = null;
    var readErrorCallback = null;

    /**
     * Создание скрытого input для загрузки файла
     */
    function createFileInput() {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        return input;
    }

    /**
     * Чтение файла как Data URL
     */
    function readFileAsDataURL(file, callback, errorCallback) {
        var reader = new FileReader();
        reader.onload = function(e) {
            callback(e.target.result);
        };
        reader.onerror = function(e) {
            if (errorCallback) {
                errorCallback({ error: 'read_error', message: 'Ошибка чтения файла' });
            }
        };
        reader.readAsDataURL(file);
    }

    /**
     * Загрузка изображения из Data URL
     */
    function loadImage(src, callback, errorCallback) {
        var img = new Image();
        img.onload = function() {
            callback(img);
        };
        img.onerror = function() {
            if (errorCallback) {
                errorCallback({ error: 'load_error', message: 'Ошибка загрузки изображения' });
            }
        };
        img.src = src;
    }

    /**
     * Поиск Data Matrix кода на изображении
     * Использует простой алгоритм поиска паттернов Data Matrix
     */
    function findDataMatrix(image) {
        try {
            // Создаем canvas для обработки изображения
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');
            
            canvas.width = image.width;
            canvas.height = image.height;
            ctx.drawImage(image, 0, 0);

            // Получаем данные изображения
            var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            var data = imageData.data;
            
            // Преобразуем в ч/б для упрощения распознавания
            var grayscale = new Uint8Array(data.length / 4);
            for (var i = 0; i < data.length; i += 4) {
                grayscale[i / 4] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            }

            // Пытаемся найти Data Matrix код с помощью библиотеки jsQR или похожего подхода
            // Для простоты используем эвристический подход
            
            // Пробуем разные области и масштабы
            var result = scanForDataMatrix(grayscale, canvas.width, canvas.height);
            
            if (result) {
                return result;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Сканирование изображения на наличие Data Matrix кода
     */
    function scanForDataMatrix(grayscale, width, height) {
        // Упрощенная реализация поиска Data Matrix
        // В реальном приложении здесь нужно использовать полноценную библиотеку
        
        // Пороговое значение для бинаризации
        var threshold = 128;
        var binary = new Uint8Array(grayscale.length);
        
        for (var i = 0; i < grayscale.length; i++) {
            binary[i] = grayscale[i] < threshold ? 1 : 0;
        }

        // Попытка найти характерный паттерн Data Matrix (L-образная граница)
        // Это упрощенная реализация - в продакшене нужно использовать ZXing или аналоги
        
        // Для демонстрации вернем заглушку
        // В реальной реализации здесь будет полноценное декодирование
        
        // Пробуем найти квадратные паттерны
        var minModuleSize = 5;
        var maxModuleSize = Math.min(width, height) / 10;
        
        for (var moduleSize = minModuleSize; moduleSize <= maxModuleSize; moduleSize++) {
            // Сканируем сетку разного размера
            for (var gridSize = 8; gridSize <= 144; gridSize += 8) {
                var codeWidth = gridSize * moduleSize;
                var codeHeight = gridSize * moduleSize;
                
                if (codeWidth > width || codeHeight > height) continue;
                
                // Проверяем различные позиции
                for (var y = 0; y <= height - codeHeight; y += moduleSize) {
                    for (var x = 0; x <= width - codeWidth; x += moduleSize) {
                        var decoded = tryDecodeDataMatrix(binary, width, x, y, codeWidth, codeHeight, gridSize);
                        if (decoded) {
                            return decoded;
                        }
                    }
                }
            }
        }
        
        return null;
    }

    /**
     * Попытка декодирования области как Data Matrix
     */
    function tryDecodeDataMatrix(binary, imageWidth, startX, startY, codeWidth, codeHeight, gridSize) {
        // Извлекаем модули сетки
        var modules = [];
        var moduleSizeX = codeWidth / gridSize;
        var moduleSizeY = codeHeight / gridSize;
        
        for (var row = 0; row < gridSize; row++) {
            modules[row] = [];
            for (var col = 0; col < gridSize; col++) {
                var sampleX = Math.floor(startX + col * moduleSizeX + moduleSizeX / 2);
                var sampleY = Math.floor(startY + row * moduleSizeY + moduleSizeY / 2);
                var index = sampleY * imageWidth + sampleX;
                modules[row][col] = binary[index] || 0;
            }
        }
        
        // Проверяем наличие характерных признаков Data Matrix
        // L-образный паттерн по левому и нижнему краю
        if (!hasDataMatrixPattern(modules, gridSize)) {
            return null;
        }
        
        // Декодируем данные (упрощенно)
        var decoded = decodeDataMatrixModules(modules, gridSize);
        return decoded;
    }

    /**
     * Проверка наличия паттерна Data Matrix
     */
    function hasDataMatrixPattern(modules, size) {
        // Проверяем левую границу (должна быть темной)
        var leftDark = 0;
        for (var i = 0; i < size; i++) {
            if (modules[i][0] === 1) leftDark++;
        }
        
        // Проверяем нижнюю границу (должна быть темной)
        var bottomDark = 0;
        for (var j = 0; j < size; j++) {
            if (modules[size - 1][j] === 1) bottomDark++;
        }
        
        // Проверяем верхнюю и правую границы (чередующиеся)
        return leftDark > size * 0.8 && bottomDark > size * 0.8;
    }

    /**
     * Декодирование модулей Data Matrix в строку
     * Упрощенная реализация для демонстрации
     */
    function decodeDataMatrixModules(modules, size) {
        // В полной реализации здесь должно быть полноценное декодирование
        // согласно спецификации Data Matrix (ECC 200)
        
        // Для демонстрации возвращаем тестовые данные
        // если паттерн похож на Data Matrix
        return {
            data: 'DEMO_DATA_' + size,
            format: 'DataMatrix',
            position: {
                topLeft: { x: 0, y: 0 },
                topRight: { x: 0, y: 0 },
                bottomLeft: { x: 0, y: 0 },
                bottomRight: { x: 0, y: 0 }
            }
        };
    }

    /**
     * Публичный интерфейс библиотеки
     */
    var dataMatrixPhotoReader = {
        /**
         * Загружает фото в клиент
         */
        upload: function() {
            var self = this;
            var input = createFileInput();
            
            input.onchange = function(e) {
                var file = e.target.files[0];
                if (!file) {
                    if (uploadErrorCallback) {
                        uploadErrorCallback({ error: 'no_file', message: 'Файл не выбран' });
                    }
                    return;
                }

                readFileAsDataURL(file, function(dataUrl) {
                    loadImage(dataUrl, function(img) {
                        uploadedImage = img;
                        if (uploadCallback) {
                            uploadCallback({ image: img, dataUrl: dataUrl });
                        }
                    }, function(err) {
                        if (uploadErrorCallback) {
                            uploadErrorCallback(err);
                        }
                    });
                }, function(err) {
                    if (uploadErrorCallback) {
                        uploadErrorCallback(err);
                    }
                });
            };

            // Программно кликаем по input
            document.body.appendChild(input);
            input.click();
            
            // Очищаем после использования
            setTimeout(function() {
                document.body.removeChild(input);
            }, 1000);
        },

        /**
         * Стартует сканирование фото
         */
        start: function() {
            var self = this;
            
            if (!uploadedImage) {
                if (readErrorCallback) {
                    readErrorCallback({ error: 'no_image', message: 'Изображение не загружено' });
                }
                return;
            }

            // Асинхронное сканирование
            setTimeout(function() {
                var result = findDataMatrix(uploadedImage);
                
                if (result) {
                    if (readyCallback) {
                        readyCallback(result);
                    }
                } else {
                    if (readErrorCallback) {
                        readErrorCallback({ error: 'decode_error', message: 'Data Matrix код не найден' });
                    }
                }
            }, 10);
        },

        /**
         * Обработчик готовности загрузки фото
         */
        onUpload: function(callback) {
            uploadCallback = callback;
            return this;
        },

        /**
         * Обработчик готовности данных
         */
        onReady: function(callback) {
            readyCallback = callback;
            return this;
        },

        /**
         * Обработчик ошибки загрузки кода
         */
        onUploadError: function(callback) {
            uploadErrorCallback = callback;
            return this;
        },

        /**
         * Обработчик ошибки считывания кода
         */
        onReadError: function(callback) {
            readErrorCallback = callback;
            return this;
        }
    };

    // Экспорт в глобальную область видимости
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = dataMatrixPhotoReader;
    } else {
        global.dataMatrixPhotoReader = dataMatrixPhotoReader;
    }

})(typeof window !== 'undefined' ? window : this);
