require('dotenv').config();
const express = require('express');
const Mixpanel = require('mixpanel');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Inicializa el cliente de Mixpanel
const mixpanel = Mixpanel.init('c3a37c1371815e9a6880626be5970b04');

// Middleware
app.use(express.json());
app.use(cors());

// Log para verificar que el token de Mixpanel se está inyectando correctamente
console.log('Token de Mixpanel:', process.env.MIXPANEL_TOKEN ? 'Configurado correctamente' : 'No configurado');

// Función para identificar usuario en Mixpanel
function identifyUserInMixpanel(userId, userProperties) {
    return new Promise((resolve, reject) => {
        mixpanel.people.set(userId, userProperties, (err) => {
            if (err) {
                console.error(`Error al identificar usuario ${userId}:`, err);
                reject(err);
            } else {
                console.log(`Usuario ${userId} identificado exitosamente en Mixpanel`);
                resolve();
            }
        });
    });
}

// Función genérica para trackear eventos en Mixpanel
function trackGenericEvent(event, properties, userId) {
    return new Promise((resolve, reject) => {
        mixpanel.track(event, { ...properties, distinct_id: userId }, (err, response) => {
            if (err) {
                console.error(`Error al trackear evento ${event}:`, err);
                reject(err);
            } else {
                console.log(`Evento ${event} trackeado exitosamente en Mixpanel`);
                resolve(response);
            }
        });
    });
}

function trackAddToCart(properties, userId) {
    const { Currency, "Shipping Country": shippingCountry, items } = properties;

    return Promise.all(items.map(item => {
        const eventProperties = {
            "distinct_id": userId,
            "Currency": Currency,
            "Quantity": item.quantity,
            "ProductId": item.id,
            "Shipping Country": shippingCountry
        };

        console.log('Enviando evento Add to Cart:', eventProperties);

        return new Promise((resolve, reject) => {
            mixpanel.track("Add to Cart", eventProperties, (err, response) => {
                if (err) {
                    console.error(`Error al trackear Add to Cart para el producto ${item.id}:`, err);
                    reject(err);
                } else {
                    console.log(`Evento Add to Cart trackeado exitosamente para el producto ${item.id}`);
                    resolve(response);
                }
            });
        });
    }));
}

function trackOrder(properties, userId) {
    const {
        orderId,
        total,
        currency,
        items,
        shippingCountry,
        paymentMethod
    } = properties;

    const eventProperties = {
        distinct_id: userId,
        "Order ID": orderId,
        "Total Amount": total,
        "Currency": currency,
        "Number of Items": items.length,
        "Shipping Country": shippingCountry,
        "Payment Method": paymentMethod,
        "Items": items.map(item => ({
            "Product Id": item.id,
            "Product Name": item.name,
            "Quantity": item.quantity,
            "Price": item.price
        }))
    };

    console.log('Enviando evento Order:', JSON.stringify(eventProperties, null, 2));

    return new Promise((resolve, reject) => {
        mixpanel.track("Order", eventProperties, (err, response) => {
            if (err) {
                console.error(`Error al trackear Order para el pedido ${orderId}:`, err);
                reject(err);
            } else {
                console.log(`Evento Order trackeado exitosamente para el pedido ${orderId}`);
                resolve(response);
            }
        });
    });
}

function trackCreateCheckout(properties, userId) {
    const eventProperties = {
        ...properties,
        distinct_id: userId
    };

    console.log('Enviando evento Create Checkout:', eventProperties);

    return trackGenericEvent("Create Checkout", eventProperties, userId);
}

function trackUpdateCheckout(properties, userId) {
    const eventProperties = {
        ...properties,
        distinct_id: userId
    };

    console.log('Enviando evento Update Checkout:', eventProperties);

    return trackGenericEvent("Update Checkout", eventProperties, userId);
}

function trackKlarnaPaymentInit(properties, userId) {
    const eventProperties = {
        ...properties,
        distinct_id: userId
    };

    console.log('Enviando evento Klarna Payment Init:', eventProperties);

    return trackGenericEvent("Klarna Payment Init", eventProperties, userId);
}

function trackStripePaymentInit(properties, userId) {
    const eventProperties = {
        ...properties,
        distinct_id: userId
    };

    console.log('Enviando evento Stripe Payment Init:', eventProperties);

    return trackGenericEvent("Stripe Payment Init", eventProperties, userId);
}

// Ruta para verificar el estado del servidor
app.get('/', (req, res) => {
    res.json({
        status: 'Server is running',
        mixpanelToken: process.env.MIXPANEL_TOKEN ? 'Configurado' : 'No configurado'
    });
});

// Ruta para identificar usuario
app.post('/identify', async (req, res) => {
    console.log('Recibida solicitud POST en /identify');
    const { userId, userProperties } = req.body;

    if (!userId) {
        console.warn('Solicitud rechazada: falta ID de usuario');
        return res.status(400).json({ error: 'Se requiere un ID de usuario' });
    }

    try {
        await identifyUserInMixpanel(userId, userProperties);
        console.log(`Respuesta exitosa enviada para identificación de usuario ${userId}`);
        res.json({
            success: true,
            message: 'Usuario identificado en Mixpanel',
            userId: userId
        });
    } catch (error) {
        console.error('Error al identificar usuario en Mixpanel:', error);
        res.status(500).json({ error: 'Error al identificar usuario' });
    }
});

app.post('/track', async (req, res) => {
    console.log('Recibida solicitud POST en /track');
    const { event, properties, userId } = req.body;

    if (!event) {
        console.warn('Solicitud rechazada: falta nombre de evento');
        return res.status(400).json({ error: 'Se requiere un nombre de evento' });
    }

    if (!userId) {
        console.warn('Solicitud rechazada: falta ID de usuario');
        return res.status(400).json({ error: 'Se requiere un ID de usuario' });
    }

    try {
        let response;
        switch (event) {
            case "Add to Cart":
                response = await trackAddToCart(properties, userId);
                break;
            case "Create Checkout":
                response = await trackCreateCheckout(properties, userId);
                break;
            case "Update Checkout":
                response = await trackUpdateCheckout(properties, userId);
                break;
            case "Klarna Payment Init":
                response = await trackKlarnaPaymentInit(properties, userId);
                break;
            case "Stripe Payment Init":
                response = await trackStripePaymentInit(properties, userId);
                break;
            case "Order":
                response = await trackOrder(properties, userId);
                break;
            default:
                response = await trackGenericEvent(event, properties, userId);
        }

        console.log(`Respuesta exitosa enviada para tracking de evento ${event}`);
        res.json({
            success: true,
            message: 'Evento(s) enviado(s) a Mixpanel',
            eventName: event,
            userId: userId,
            mixpanelResponse: response
        });
    } catch (error) {
        console.error('Error al enviar el evento a Mixpanel:', error);
        res.status(500).json({ error: 'Error al procesar el evento' });
    }
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
    console.log('Token de Mixpanel:', process.env.MIXPANEL_TOKEN ? 'Configurado correctamente' : 'No configurado');
});